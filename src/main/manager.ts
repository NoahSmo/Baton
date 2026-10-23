import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { Dict } from '../shared/i18n'
import { needsAttention, nextStatus, slugify } from '../shared/status'
import {
  DEFAULT_AGENT_MODEL,
  DEFAULT_QA,
  type AgentModel,
  type QaConfig,
  type AppState,
  type CreateFeatureInput,
  type Feature,
  type GitBranch,
  type GitChange,
  type GitStatus,
  type AgentTurn,
  type CommitAction,
  type HandoffDraft,
  type ImageInput,
  type LaunchCommand,
  type LinearIssue,
  type MessageAttachments,
  type PermissionDecision,
  type PermissionMode,
  type Project,
  type ProjectInput,
  type ProjectPatch,
  type PromptTemplate,
  type ConflictCheck,
  type ConflictEdit,
  type ConflictResolution,
  type PullRequestDraft,
  type RepoInfo,
  type StoredEvent,
  type TrashEntry,
  type TurnCost,
  type UiEvent,
  type UsageWarning,
  type UsageWindow,
  type BackgroundTask,
  worksInPlace
} from '../shared/types'
import { AgentSession, type AgentOutput } from './agent'
import { removeAttachments, saveFiles, saveImages, withFiles } from './attachments'
import { abortMerge, checkConflicts, finishMerge, mergeUpstream, resolveConflicts } from './conflicts'
import { changesSince, commitChanges, commitOp, gitStatus, hasLanded, lastGitActivity, listBranches, pull, push, snapshotTree, strayWorktrees, switchBranch } from './git'
import type { LinearClient } from './linear'
import { createPullRequest } from './pullRequest'
import type { Store } from './store'
import { applyChanges, captureChanges, discardTrash, listTrash, readMeta, saveToTrash } from './trash'
import { addWorktreeOnBranch, createWorktree, fetchRemotes, removeWorktree, repoState, type Worktree } from './worktree'

/** A merge is often followed by a last word with the agent: a feature just touched is left alone. */
const MERGED_GRACE_MS = 60 * 60 * 1000

/** The prompt cache lives an hour: past that, the next request pays for the whole conversation again. */
const CACHE_TTL_MS = 60 * 60 * 1000

/** Below this, a summary would cost about as much as it saves. */
const COMPACT_MIN_TOKENS = 60_000

/** How long to hold back when the limit refuses a request without saying when it resets. */
const UNKNOWN_RESET_MS = 5 * 60 * 1000

/** A message held back until an agent slot frees up. */
interface PendingMessage {
  text: string
  images: ImageInput[]
  /** When the agent last did anything, to tell at dispatch time whether its cache is gone. */
  idleSince: number | null
}

const isActive = (f: Feature) => f.status === 'working' || f.status === 'waiting'

export interface ManagerSink {
  event(ev: StoredEvent): void
  feature(feature: Feature): void
  featureRemoved(featureId: string): void
  projectRemoved(projectId: string): void
  stream(featureId: string, text: string): void
  backgroundTasks(featureId: string, tasks: BackgroundTask[]): void
  /** Called when a feature moves to a status worth notifying about. */
  attention(feature: Feature): void
  /** A usage window is nearly used up (called once per window), or null once the limit lifted. */
  usageWarning(warning: UsageWarning | null): void
  /** What the agents last reported of each usage window; empty once the limit lifted. */
  usageWindows(windows: UsageWindow[]): void
}

export class Manager {
  private sessions = new Map<string, AgentSession>()
  /** Messages of agents waiting for a slot, oldest agent first. */
  private queue = new Map<string, PendingMessage[]>()
  private warnedWindows = new Set<string>()
  private windows = new Map<string, UsageWindow>()
  /** Epoch milliseconds until which the usage limit refuses requests: queued agents wait it out. */
  private limitedUntil = 0
  private limitTimer: ReturnType<typeof setTimeout> | null = null
  /** Which usage window refused the last request, so an unrelated one allowing requests does not lift it. */
  private limitedType: string | undefined

  constructor(
    private readonly store: Store,
    private readonly worktreesRoot: string,
    /** Images sent to the agents, one folder per feature. */
    private readonly attachmentsRoot: string,
    /** Uncommitted work of removed features, kept for a few days. */
    private readonly trashRoot: string,
    private readonly linear: LinearClient,
    /** Messages in the language currently selected in the app. */
    private readonly t: () => Dict,
    /** Agents allowed to run a turn at once; 0 for no limit. */
    private readonly maxRunning: () => number,
    private readonly sink: ManagerSink
  ) {
    // No agent process survives an app restart: anything left mid-turn is idle now.
    for (const f of store.listFeatures()) {
      if (isActive(f) || f.status === 'queued') {
        // Nobody is left to receive an answer to the questions that turn was asking.
        for (const requestId of this.openPermissionRequests(f.id)) {
          this.record(f.id, { kind: 'permission_resolved', requestId, behavior: 'deny' })
        }
        this.record(f.id, { kind: 'notice', notice: { code: 'app_closed' } })
        this.patch(f.id, { status: 'idle' })
      } else if (f.status === 'limited') {
        // The limit may have lifted while the app was closed; if not, keep waiting it out.
        if (f.limitResetsAt && f.limitResetsAt * 1000 > Date.now()) this.holdQueueUntil(f.limitResetsAt * 1000)
        else this.patch(f.id, { status: 'idle', limitResetsAt: null })
      }
    }
  }

  getState(): AppState {
    return { projects: this.store.listProjects(), features: this.store.listFeatures().map((f) => this.view(f)) }
  }

  /** A feature as the interface shows it: with its place in the queue, which the store does not know. */
  private view(feature: Feature): Feature {
    const place = [...this.queue.keys()].indexOf(feature.id)
    return { ...feature, queuePosition: place === -1 ? null : place + 1 }
  }

  /** The queue changed: every queued agent may have a new place. */
  private republishQueue(): void {
    for (const id of this.queue.keys()) {
      const feature = this.store.getFeature(id)
      if (feature) this.sink.feature(this.view(feature))
    }
  }

  setPinned(featureId: string, pinned: boolean): void {
    this.mustGet(featureId)
    this.patch(featureId, { pinned })
  }

  setArchived(featureId: string, archived: boolean): void {
    this.mustGet(featureId)
    this.patch(featureId, { archived })
  }

  /** Puts a queued agent first in line. */
  promoteQueued(featureId: string): void {
    const messages = this.queue.get(featureId)
    if (!messages) return
    const rest = [...this.queue].filter(([id]) => id !== featureId)
    this.queue = new Map([[featureId, messages], ...rest])
    this.republishQueue()
  }

  turnCosts(): TurnCost[] {
    return this.store.listTurnCosts()
  }

  async inspectFolder(path: string): Promise<RepoInfo> {
    return {
      path,
      name: basename(path),
      ...(await repoState(path)),
      existingProjectId: this.store.getProjectByPath(path)?.id ?? null
    }
  }

  async createProject(input: ProjectInput): Promise<Project> {
    if (this.store.getProjectByPath(input.path)) throw new Error(this.t().errors.folderTaken)
    const { isGit } = await repoState(input.path)
    const project: Project = {
      id: randomUUID(),
      name: input.name.trim() || basename(input.path),
      path: input.path,
      color: input.color,
      linearLabel: input.linearLabel,
      commands: [],
      templates: [],
      worktrees: isGit && input.worktrees,
      qa: DEFAULT_QA
    }
    this.store.insertProject(project)
    return project
  }

  async updateProject(projectId: string, patch: ProjectPatch): Promise<Project> {
    const project = this.store.getProject(projectId)
    if (!project) throw new Error(this.t().errors.unknownProject)
    const updated: Project = {
      ...project,
      name: patch.name.trim() || project.name,
      color: patch.color,
      linearLabel: patch.linearLabel,
      worktrees: patch.worktrees && (await repoState(project.path)).isGit
    }
    this.store.updateProject(updated)
    return updated
  }

  setProjectCommands(projectId: string, commands: LaunchCommand[]): Project {
    const project = this.store.getProject(projectId)
    if (!project) throw new Error(this.t().errors.unknownProject)
    const updated: Project = {
      ...project,
      commands: commands
        .map((c) => ({ id: c.id || randomUUID(), name: c.name.trim(), command: c.command.trim() }))
        .filter((c) => c.command)
    }
    this.store.updateProject(updated)
    return updated
  }

  setProjectQa(projectId: string, qa: QaConfig): Project {
    const project = this.store.getProject(projectId)
    if (!project) throw new Error(this.t().errors.unknownProject)
    const command = qa.command.trim()
    // Tests with nothing to run cannot be on.
    const updated: Project = { ...project, qa: { enabled: qa.enabled && Boolean(command), command } }
    this.store.updateProject(updated)
    return updated
  }

  setProjectTemplates(projectId: string, templates: PromptTemplate[]): Project {
    const project = this.store.getProject(projectId)
    if (!project) throw new Error(this.t().errors.unknownProject)
    const updated: Project = {
      ...project,
      templates: templates
        .map((x) => ({ id: x.id || randomUUID(), name: x.name.trim(), text: x.text.trim() }))
        .filter((x) => x.text)
        .map((x) => ({ ...x, name: x.name || x.text.slice(0, 24).trim() }))
    }
    this.store.updateProject(updated)
    return updated
  }

  /** Forgets a project. Nothing on disk is touched, which is why its features must be gone first. */
  removeProject(projectId: string): void {
    if (this.store.listFeatures().some((f) => f.projectId === projectId)) {
      throw new Error(this.t().errors.projectHasFeatures)
    }
    this.store.deleteProject(projectId)
    this.sink.projectRemoved(projectId)
  }

  renameFeature(featureId: string, title: string): void {
    this.mustGet(featureId)
    if (!title.trim()) throw new Error(this.t().errors.needTitle)
    this.patch(featureId, { title: title.trim() })
  }

  /** Ties an agent to an issue after the fact, or unties it. The branch keeps its name. */
  linkIssue(featureId: string, issue: LinearIssue | null): void {
    const feature = this.mustGet(featureId)
    this.patch(featureId, {
      linear: issue ? { issueId: issue.id, identifier: issue.identifier, url: issue.url } : null
    })
    // An agent already at work means the issue has started; otherwise its first message says so.
    if (issue && feature.sessionId) void this.startLinearIssue(this.mustGet(featureId))
  }

  /** Takes effect at once, in the middle of a turn included. */
  async setPermissionMode(featureId: string, mode: PermissionMode): Promise<void> {
    this.mustGet(featureId)
    this.patch(featureId, { permissionMode: mode })
    await this.sessions.get(featureId)?.setPermissionMode(mode)
  }

  /** Takes effect from the agent's next request. */
  async setAgentModel(featureId: string, model: AgentModel): Promise<void> {
    this.mustGet(featureId)
    this.patch(featureId, { agentModel: model })
    await this.sessions.get(featureId)?.setModel(model)
  }

  /** Folder a terminal or the editor works in. */
  featureRoot(featureId: string): string {
    return this.mustGet(featureId).worktreePath
  }

  /** The branch is read back each time: the agent and the terminal switch it without telling. */
  async gitStatus(featureId: string): Promise<GitStatus> {
    const status = await gitStatus(this.featureRoot(featureId))
    if (status.branch && status.branch !== this.store.getFeature(featureId)?.branch) {
      this.patch(featureId, { branch: status.branch })
    }
    return status
  }

  /** Branches of the feature's worktree, those in use elsewhere named after their feature or project. */
  async gitBranches(featureId: string): Promise<GitBranch[]> {
    const { projects, features } = this.getState()
    const owner = (path: string) =>
      features.find((f) => f.worktreePath === path)?.title ?? projects.find((p) => p.path === path)?.name ?? basename(path)
    const branches = await listBranches(this.featureRoot(featureId))
    return branches.map((b) => (b.heldBy ? { ...b, heldBy: owner(b.heldBy) } : b))
  }

  private isBusy(featureId: string): boolean {
    const { status } = this.mustGet(featureId)
    return status === 'working' || status === 'waiting'
  }

  async switchBranch(featureId: string, branch: string): Promise<void> {
    const feature = this.mustGet(featureId)
    // Files changing under a running turn would leave the agent working on a tree it never read.
    if (this.isBusy(featureId)) throw new Error(this.t().errors.agentBusy)
    await switchBranch(feature.worktreePath, branch)
    this.patch(featureId, { branch })
  }

  /** Cherry-picks or reverts a commit, or opens a branch at it. Rewriting files is refused under a running turn. */
  async commitAction(featureId: string, hash: string, action: CommitAction, name?: string): Promise<void> {
    if (action !== 'branch' && this.isBusy(featureId)) throw new Error(this.t().errors.agentBusy)
    await commitOp(this.featureRoot(featureId), hash, action, name)
  }

  /** Each message sent to the agent and the result that answered it, read back from the journal. */
  agentTurns(featureId: string): AgentTurn[] {
    const turns: AgentTurn[] = []
    let start: number | null = null
    for (const { at, event } of this.store.listEvents(featureId)) {
      if (event.kind === 'user') start = at
      else if (event.kind === 'result' && start !== null) {
        turns.push({ start, end: at, costUsd: event.turnCostUsd })
        start = null
      }
    }
    return turns
  }

  async commitChanges(featureId: string, message: string, paths: string[]): Promise<void> {
    await commitChanges(this.featureRoot(featureId), message, paths)
  }

  async pull(featureId: string): Promise<void> {
    // Like a checkout, a pull rewrites files under a running turn.
    if (this.isBusy(featureId)) throw new Error(this.t().errors.agentBusyPull)
    await pull(this.featureRoot(featureId))
  }

  async push(featureId: string): Promise<void> {
    const root = this.featureRoot(featureId)
    // The caller looked for conflicts; what is left of the upstream goes in cleanly.
    await mergeUpstream(root)
    await push(root)
  }

  async checkConflicts(featureId: string): Promise<ConflictCheck | null> {
    return checkConflicts(this.featureRoot(featureId))
  }

  async resolveConflicts(featureId: string, target: string, abort: AbortController): Promise<ConflictResolution> {
    // Resolving rewrites files under a running turn, like a pull.
    if (this.isBusy(featureId)) throw new Error(this.t().errors.agentBusyPull)
    return resolveConflicts(this.featureRoot(featureId), target, abort)
  }

  async finishMerge(featureId: string, edits: ConflictEdit[]): Promise<void> {
    const root = this.featureRoot(featureId)
    await finishMerge(root, edits)
    await push(root)
  }

  async abortMerge(featureId: string): Promise<void> {
    await abortMerge(this.featureRoot(featureId))
  }

  async createFeature(input: CreateFeatureInput): Promise<Feature> {
    const project = this.store.getProject(input.projectId)
    if (!project) throw new Error(this.t().errors.unknownProject)
    const title = input.title.trim()
    if (!title) throw new Error(this.t().errors.needTitle)

    const issue = input.linearIssue
    const worktree = project.worktrees
      ? await createWorktree(
          project.path,
          this.projectWorktrees(project),
          slugify(issue ? `${issue.identifier} ${issue.title}` : title),
          issue?.branchName || undefined
        )
      : await this.inPlace(project)
    return this.register(project, worktree, input)
  }

  /** The project folder itself, on whatever branch it is on; no branch at all outside a repository. */
  private async inPlace(project: Project): Promise<Worktree> {
    return { branch: (await repoState(project.path)).branch ?? '', path: project.path }
  }

  /** Keyed by id as well: two projects may share a folder name, and names can be edited. */
  private projectWorktrees(project: Project): string {
    return join(this.worktreesRoot, `${basename(project.path)}-${project.id.slice(0, 8)}`)
  }

  /** Records a feature whose worktree exists, and sends its first message. */
  private register(project: Project, worktree: Worktree, input: CreateFeatureInput): Feature {
    const issue = input.linearIssue
    const now = Date.now()
    const feature: Feature = {
      id: randomUUID(),
      projectId: project.id,
      title: input.title.trim(),
      linear: issue ? { issueId: issue.id, identifier: issue.identifier, url: issue.url } : null,
      branch: worktree.branch,
      worktreePath: worktree.path,
      status: 'idle',
      permissionMode: input.permissionMode,
      agentModel: input.agentModel ?? DEFAULT_AGENT_MODEL,
      sessionId: null,
      model: null,
      costUsd: 0,
      contextTokens: 0,
      limitResetsAt: null,
      pinned: false,
      archived: false,
      queuePosition: null,
      prUrl: null,
      turnBase: null,
      createdAt: now,
      updatedAt: now
    }
    this.store.insertFeature(feature)
    this.sink.feature(feature)
    const { images = [], files = [] } = input.attachments ?? {}
    if (input.prompt.trim() || images.length || files.length) {
      this.send(feature.id, input.prompt.trim(), input.attachments)
    }
    return this.view(this.store.getFeature(feature.id)!)
  }

  /**
   * Starts a new agent from another's work: a branch cut from the old one's, its
   * uncommitted changes carried over, and the summary as first message. The old agent
   * keeps its own worktree, so the two cannot step on each other.
   */
  async continueFeature(featureId: string, handoff: HandoffDraft): Promise<Feature> {
    const source = this.mustGet(featureId)
    const project = this.store.getProject(source.projectId)
    if (!project) throw new Error(this.t().errors.unknownProject)
    const title = handoff.title.trim() || source.title
    // Without worktrees, the new agent shares the folder, and with it the work in progress.
    if (!project.worktrees) {
      return this.register(project, await this.inPlace(project), {
        projectId: project.id,
        title,
        prompt: this.t().handoff.prompt(source.title, handoff.summary),
        permissionMode: source.permissionMode,
        agentModel: source.agentModel
      })
    }
    const worktree = await createWorktree(project.path, this.projectWorktrees(project), slugify(title), undefined, source.branch)
    const carry = await mkdtemp(join(tmpdir(), 'baton-carry-'))
    try {
      if (await captureChanges(source.worktreePath, carry)) await applyChanges(carry, worktree.path)
    } catch {
      // The new agent starts from the committed work; the summary says what was in progress.
    } finally {
      await rm(carry, { recursive: true, force: true })
    }
    return this.register(project, worktree, {
      projectId: project.id,
      title,
      prompt: this.t().handoff.prompt(source.title, handoff.summary),
      permissionMode: source.permissionMode,
      agentModel: source.agentModel
    })
  }

  getEvents(featureId: string): StoredEvent[] {
    return this.store.listEvents(featureId)
  }

  /** Folder holding the images and documents sent to a feature's agent. */
  attachmentsDir(featureId: string): string {
    return join(this.attachmentsRoot, this.mustGet(featureId).id)
  }

  send(featureId: string, text: string, { images = [], files = [] }: MessageAttachments = {}): void {
    const feature = this.mustGet(featureId)
    const dir = this.attachmentsDir(featureId)
    // Documents first: they are the ones that can be refused, and nothing should be left behind then.
    const fileRefs = saveFiles(dir, files)
    // Kept on disk so the journal stays small and the transcript can show them again.
    const imageRefs = saveImages(dir, images)
    // Read before this message joins the journal.
    const idleSince = this.store.lastEventAt(featureId)
    // An agent already in a turn takes the message along; another one needs a free slot.
    const runNow = isActive(feature) || (feature.status !== 'queued' && this.hasFreeSlot() && !this.isLimited())
    // A turn begins: remember the worktree as it is, to show later what the turn changed.
    if (!isActive(feature) && feature.status !== 'queued') void this.snapshotTurn(featureId)
    // The first message is when work on the issue actually begins.
    if (feature.linear && !feature.sessionId) void this.startLinearIssue(feature)
    this.record(featureId, {
      kind: 'user',
      text,
      ...(imageRefs.length ? { images: imageRefs } : {}),
      ...(fileRefs.length ? { files: fileRefs } : {})
    })
    const message: PendingMessage = { text: withFiles(text, dir, fileRefs), images, idleSince }
    if (runNow) {
      this.dispatch(feature, [message])
      return
    }
    const waiting = this.queue.get(featureId)
    if (waiting) waiting.push(message)
    else {
      this.queue.set(featureId, [message])
      this.record(featureId, { kind: 'notice', notice: { code: 'queued', maxRunning: this.maxRunning() } })
    }
    this.patch(featureId, { status: 'queued' })
    this.republishQueue()
  }

  private async snapshotTurn(featureId: string): Promise<void> {
    try {
      const turnBase = await snapshotTree(this.featureRoot(featureId))
      this.patch(featureId, { turnBase })
    } catch {
      // Not a repository any more, or the feature is gone: nothing to compare with.
    }
  }

  /** What the agent changed since its last turn began; null without a snapshot of that moment. */
  async turnChanges(featureId: string): Promise<{ base: string; changes: GitChange[] } | null> {
    const { turnBase, worktreePath } = this.mustGet(featureId)
    if (!turnBase) return null
    return { base: turnBase, changes: await changesSince(worktreePath, turnBase) }
  }

  /** Starts queued agents while slots are free; called whenever one may have freed up. */
  startQueued(): void {
    if (this.isLimited()) return
    for (const [featureId, messages] of this.queue) {
      if (!this.hasFreeSlot()) return
      this.queue.delete(featureId)
      const feature = this.store.getFeature(featureId)
      if (!feature) continue
      this.patch(featureId, { status: 'working' })
      this.dispatch(feature, messages)
      void this.snapshotTurn(featureId)
    }
    this.republishQueue()
  }

  private hasFreeSlot(): boolean {
    const max = this.maxRunning()
    return max <= 0 || this.store.listFeatures().filter(isActive).length < max
  }

  private dispatch(feature: Feature, messages: PendingMessage[]): void {
    const session = this.sessionFor(feature)
    messages.forEach((m, i) => session.send(m.text, m.images, i === 0 && this.isCold(feature, m.idleSince)))
  }

  /** Whether the agent's prompt cache has expired on a conversation big enough to be worth summarising first. */
  private isCold(feature: Feature, idleSince: number | null): boolean {
    return (
      Boolean(feature.sessionId) &&
      feature.contextTokens >= COMPACT_MIN_TOKENS &&
      idleSince !== null &&
      Date.now() - idleSince >= CACHE_TTL_MS
    )
  }

  private async startLinearIssue(feature: Feature): Promise<void> {
    const { issueId, identifier } = feature.linear!
    try {
      const state = await this.linear.markStarted(issueId)
      if (state) this.record(feature.id, { kind: 'notice', notice: { code: 'linear_moved', identifier, state } })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      this.record(feature.id, { kind: 'notice', notice: { code: 'linear_failed', identifier, reason } })
    }
  }

  respondPermission(featureId: string, requestId: string, decision: PermissionDecision): void {
    if (!this.sessions.get(featureId)?.respond(requestId, decision)) {
      // The process that asked is gone; close the card so the UI is not stuck on it.
      this.record(featureId, { kind: 'permission_resolved', requestId, behavior: 'deny' })
    }
  }

  async interrupt(featureId: string): Promise<void> {
    if (this.queue.delete(featureId)) {
      // Never sent: the agent knows nothing of these messages.
      this.record(featureId, { kind: 'result', isError: false, interrupted: true, text: '', turnCostUsd: 0 })
      this.republishQueue()
      return
    }
    await this.sessions.get(featureId)?.interrupt()
  }

  async removeFeature(featureId: string): Promise<void> {
    const feature = this.mustGet(featureId)
    const project = this.store.getProject(feature.projectId)
    this.sessions.get(featureId)?.close()
    this.sessions.delete(featureId)
    if (this.queue.delete(featureId)) this.republishQueue()
    // The project folder is the user's own: only a worktree made for the agent goes with it.
    if (project && !worksInPlace(feature, project)) {
      // Whatever was not committed would be lost with the worktree: it is kept for a few days.
      await saveToTrash(this.trashRoot, feature, project.name).catch(() => null)
      await removeWorktree(project.path, feature.worktreePath)
    }
    removeAttachments(this.attachmentsDir(featureId))
    this.store.deleteFeature(featureId)
    this.sink.featureRemoved(featureId)
  }

  trashList(): Promise<TrashEntry[]> {
    return listTrash(this.trashRoot)
  }

  trashDiscard(id: string): Promise<void> {
    return discardTrash(this.trashRoot, id)
  }

  /** Brings a removed feature back: a worktree on its branch, holding the changes it had. */
  async trashRestore(id: string): Promise<Feature> {
    const meta = await readMeta(this.trashRoot, id)
    if (!meta) throw new Error(this.t().errors.trashGone)
    const project = this.store.getProject(meta.projectId)
    if (!project) throw new Error(this.t().errors.unknownProject)
    const worktree = await addWorktreeOnBranch(project.path, this.projectWorktrees(project), slugify(meta.title), meta.branch, meta.head)
    await applyChanges(join(this.trashRoot, id), worktree.path)
    await discardTrash(this.trashRoot, id)
    return this.register(project, worktree, { projectId: project.id, title: meta.title, prompt: '', permissionMode: 'default', agentModel: DEFAULT_AGENT_MODEL })
  }

  /** Pushes the branch when it has nothing to compare with, then opens its pull request. */
  async createPullRequest(featureId: string, draft: PullRequestDraft): Promise<string> {
    const feature = this.mustGet(featureId)
    const status = await gitStatus(feature.worktreePath)
    if (!status.branch) throw new Error(this.t().errors.detachedHead)
    if (status.ahead > 0 || !status.upstream) await push(feature.worktreePath)
    const url = await createPullRequest(feature.worktreePath, status.branch, draft)
    this.patch(featureId, { prUrl: url })
    return url
  }

  /** Looks up what has been merged on the remotes since the last time. */
  async refreshRemotes(): Promise<void> {
    await Promise.all(this.store.listProjects().map((p) => fetchRemotes(p.path)))
  }

  /**
   * Whether a feature is over: its branch has landed, its worktree holds nothing
   * uncommitted, and nobody has worked in it for a while.
   */
  async isMerged(featureId: string): Promise<boolean> {
    const feature = this.store.getFeature(featureId)
    if (!feature || feature.status === 'working' || feature.status === 'waiting') return false
    // The project folder stays, merged or not.
    const project = this.store.getProject(feature.projectId)
    if (!project || worksInPlace(feature, project)) return false
    if (Date.now() - feature.updatedAt < MERGED_GRACE_MS) return false
    // A worktree that is gone or unreadable is not one to decide about.
    return hasLanded(feature.worktreePath).catch(() => false)
  }

  /**
   * Removes the worktrees agents added on their own under the app's folder, which
   * outlive the feature that made them. Only those with a branch, nothing
   * uncommitted and no recent activity go: the branch keeps every commit.
   */
  async removeStrayWorktrees(): Promise<string[]> {
    const known = new Set(this.store.listFeatures().map((f) => f.worktreePath))
    const removed: string[] = []
    for (const project of this.store.listProjects()) {
      const strays = await strayWorktrees(project.path, this.worktreesRoot, known).catch(() => [])
      for (const { path, branch } of strays) {
        if (!branch || Date.now() - lastGitActivity(path) < MERGED_GRACE_MS) continue
        try {
          if ((await gitStatus(path)).changes.length) continue
          await removeWorktree(project.path, path)
          removed.push(branch)
        } catch {
          // Unreadable, or removed meanwhile: not one to decide about.
        }
      }
    }
    return removed
  }

  shutdown(): void {
    if (this.limitTimer) clearTimeout(this.limitTimer)
    for (const session of this.sessions.values()) session.close()
    this.sessions.clear()
  }

  private openPermissionRequests(featureId: string): string[] {
    const open = new Set<string>()
    for (const { event } of this.store.listEvents(featureId)) {
      if (event.kind === 'permission_request') open.add(event.requestId)
      else if (event.kind === 'permission_resolved') open.delete(event.requestId)
    }
    return [...open]
  }

  private mustGet(featureId: string): Feature {
    const feature = this.store.getFeature(featureId)
    if (!feature) throw new Error(this.t().errors.unknownFeature)
    return feature
  }

  private sessionFor(feature: Feature): AgentSession {
    let session = this.sessions.get(feature.id)
    if (!session) {
      session = new AgentSession({
        cwd: feature.worktreePath,
        attachmentsDir: this.attachmentsDir(feature.id),
        permissionMode: feature.permissionMode,
        model: feature.agentModel,
        sessionId: feature.sessionId,
        emit: (out) => this.onAgentOutput(feature.id, out)
      })
      this.sessions.set(feature.id, session)
    }
    return session
  }

  private onAgentOutput(featureId: string, out: AgentOutput): void {
    // Output can still arrive while a removed feature's process shuts down.
    const feature = this.store.getFeature(featureId)
    if (!feature) return

    switch (out.type) {
      case 'event':
        this.record(featureId, out.event)
        return
      case 'session':
        this.patch(featureId, { sessionId: out.sessionId, model: out.model })
        return
      case 'stream':
        this.sink.stream(featureId, out.text)
        return
      case 'background':
        this.sink.backgroundTasks(featureId, out.tasks)
        return
      case 'context':
        this.patch(featureId, { contextTokens: out.tokens })
        return
      case 'compacted': {
        if (out.ok) {
          this.record(featureId, {
            kind: 'notice',
            notice: { code: 'context_compacted', preTokens: out.preTokens ?? 0, postTokens: out.postTokens }
          })
        }
        const now = this.store.getFeature(featureId)!
        this.patch(featureId, {
          costUsd: now.costUsd + out.costUsd,
          ...(out.postTokens ? { contextTokens: out.postTokens } : {})
        })
        return
      }
      case 'closed':
        // A process that dies mid-turn leaves no result event behind.
        if (feature.status === 'working' || feature.status === 'waiting') this.patch(featureId, { status: 'idle' })
        return
    }
  }

  /** Appends to the journal, then projects the event onto the feature row. */
  private record(featureId: string, event: UiEvent): void {
    const feature = this.store.getFeature(featureId)
    if (!feature) return
    this.sink.event(this.store.appendEvent(featureId, event))

    const patch: Partial<Feature> = { status: nextStatus(feature.status, event) }
    // Tool calls can run in parallel: answering one request does not unblock the others.
    if (event.kind === 'permission_resolved' && this.sessions.get(featureId)?.hasPendingRequests) {
      patch.status = 'waiting'
    }
    if (event.kind === 'result') patch.costUsd = feature.costUsd + event.turnCostUsd
    if (event.kind === 'rate_limit' && event.status === 'rejected') {
      patch.limitResetsAt = event.resetsAt ?? null
      this.limitedType = event.limitType
      // Without a reset time, retry later rather than stay refused for good.
      this.holdQueueUntil(event.resetsAt ? event.resetsAt * 1000 : Date.now() + UNKNOWN_RESET_MS)
    }
    if (event.kind === 'rate_limit') this.trackWindow(event)
    if (event.kind === 'rate_limit' && event.status === 'allowed_warning') this.warnUsage(event)
    if (event.kind === 'user') patch.limitResetsAt = null
    this.patch(featureId, patch)
    // Claude says the window we were refused on takes requests again, whatever the clock said.
    if (event.kind === 'rate_limit' && event.status === 'allowed' && this.isLimited()) {
      if (!this.limitedType || !event.limitType || this.limitedType === event.limitType) this.liftLimit()
    }
  }

  private isLimited(): boolean {
    return Date.now() < this.limitedUntil
  }

  /** Queued agents would only be refused until the limit resets. */
  private holdQueueUntil(at: number): void {
    if (at <= this.limitedUntil) return
    this.limitedUntil = at
    if (this.limitTimer) clearTimeout(this.limitTimer)
    this.limitTimer = setTimeout(() => this.liftLimit(), at - Date.now() + 5000)
  }

  /** The limit is over: agents it stopped may run again. */
  private liftLimit(): void {
    this.limitedUntil = 0
    this.limitedType = undefined
    if (this.limitTimer) clearTimeout(this.limitTimer)
    this.limitTimer = null
    for (const f of this.store.listFeatures()) {
      if (f.status === 'limited') this.patch(f.id, { status: 'idle', limitResetsAt: null })
    }
    this.warnedWindows.clear()
    this.windows.clear()
    this.sink.usageWindows([])
    this.sink.usageWarning(null)
    this.startQueued()
  }

  private trackWindow(event: Extract<UiEvent, { kind: 'rate_limit' }>): void {
    const utilization = event.status === 'rejected' ? 1 : event.utilization
    if (utilization === undefined) return
    this.windows.set(event.limitType ?? '', { limitType: event.limitType, utilization, resetsAt: event.resetsAt })
    this.sink.usageWindows([...this.windows.values()])
  }

  private warnUsage(event: Extract<UiEvent, { kind: 'rate_limit' }>): void {
    const window = `${event.limitType}:${event.resetsAt}`
    if (this.warnedWindows.has(window)) return
    this.warnedWindows.add(window)
    this.sink.usageWarning({ limitType: event.limitType, resetsAt: event.resetsAt, utilization: event.utilization })
  }

  private patch(featureId: string, patch: Partial<Feature>): void {
    const before = this.store.getFeature(featureId)
    if (!before) return
    const after: Feature = { ...before, ...patch, updatedAt: Date.now() }
    this.store.updateFeature(after)
    this.sink.feature(this.view(after))
    if (after.status !== before.status && needsAttention(after.status)) this.sink.attention(after)
    // Deferred: the turn that just ended may still be recording its own events.
    if (isActive(before) && !isActive(after) && this.queue.size) queueMicrotask(() => this.startQueued())
  }
}
