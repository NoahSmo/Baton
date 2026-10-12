import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import type { Dict } from '../shared/i18n'
import { needsAttention, nextStatus, slugify } from '../shared/status'
import type {
  AppState,
  CreateFeatureInput,
  Feature,
  PermissionDecision,
  Project,
  ProjectInput,
  ProjectPatch,
  RepoInfo,
  StoredEvent,
  UiEvent
} from '../shared/types'
import { AgentSession, type AgentOutput } from './agent'
import type { LinearClient } from './linear'
import type { Store } from './store'
import { createWorktree, removeWorktree, repoState } from './worktree'

export interface ManagerSink {
  event(ev: StoredEvent): void
  feature(feature: Feature): void
  featureRemoved(featureId: string): void
  projectRemoved(projectId: string): void
  stream(featureId: string, text: string): void
  /** Called when a feature moves to a status worth notifying about. */
  attention(feature: Feature): void
}

export class Manager {
  private sessions = new Map<string, AgentSession>()

  constructor(
    private readonly store: Store,
    private readonly worktreesRoot: string,
    private readonly linear: LinearClient,
    /** Messages in the language currently selected in the app. */
    private readonly t: () => Dict,
    private readonly sink: ManagerSink
  ) {
    // No agent process survives an app restart: anything left mid-turn is idle now.
    for (const f of store.listFeatures()) {
      if (f.status === 'working' || f.status === 'waiting') {
        // Nobody is left to receive an answer to the questions that turn was asking.
        for (const requestId of this.openPermissionRequests(f.id)) {
          this.record(f.id, { kind: 'permission_resolved', requestId, behavior: 'deny' })
        }
        this.record(f.id, { kind: 'notice', notice: { code: 'app_closed' } })
        this.patch(f.id, { status: 'idle' })
      }
    }
  }

  getState(): AppState {
    return { projects: this.store.listProjects(), features: this.store.listFeatures() }
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
    if (!(await repoState(input.path)).isGit) throw new Error(this.t().errors.notGit(input.path))
    const project: Project = {
      id: randomUUID(),
      name: input.name.trim() || basename(input.path),
      path: input.path,
      color: input.color,
      linearProject: input.linearProject
    }
    this.store.insertProject(project)
    return project
  }

  updateProject(projectId: string, patch: ProjectPatch): Project {
    const project = this.store.getProject(projectId)
    if (!project) throw new Error(this.t().errors.unknownProject)
    const updated: Project = {
      ...project,
      name: patch.name.trim() || project.name,
      color: patch.color,
      linearProject: patch.linearProject
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

  async createFeature(input: CreateFeatureInput): Promise<Feature> {
    const project = this.store.getProject(input.projectId)
    if (!project) throw new Error(this.t().errors.unknownProject)
    const title = input.title.trim()
    if (!title) throw new Error(this.t().errors.needTitle)

    const issue = input.linearIssue
    const worktree = await createWorktree(
      project.path,
      // Keyed by id as well: two projects may share a folder name, and names can be edited.
      join(this.worktreesRoot, `${basename(project.path)}-${project.id.slice(0, 8)}`),
      slugify(issue ? `${issue.identifier} ${issue.title}` : title),
      issue?.branchName || undefined
    )
    const now = Date.now()
    const feature: Feature = {
      id: randomUUID(),
      projectId: project.id,
      title,
      linear: issue ? { issueId: issue.id, identifier: issue.identifier, url: issue.url } : null,
      branch: worktree.branch,
      worktreePath: worktree.path,
      status: 'idle',
      permissionMode: input.permissionMode,
      sessionId: null,
      model: null,
      costUsd: 0,
      limitResetsAt: null,
      createdAt: now,
      updatedAt: now
    }
    this.store.insertFeature(feature)
    this.sink.feature(feature)
    if (input.prompt.trim()) this.send(feature.id, input.prompt.trim())
    return this.store.getFeature(feature.id)!
  }

  getEvents(featureId: string): StoredEvent[] {
    return this.store.listEvents(featureId)
  }

  send(featureId: string, text: string): void {
    const feature = this.mustGet(featureId)
    // The first message is when work on the issue actually begins.
    if (feature.linear && !feature.sessionId) void this.startLinearIssue(feature)
    this.record(featureId, { kind: 'user', text })
    this.sessionFor(feature).send(text)
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
    await this.sessions.get(featureId)?.interrupt()
  }

  async removeFeature(featureId: string): Promise<void> {
    const feature = this.mustGet(featureId)
    const project = this.store.getProject(feature.projectId)
    this.sessions.get(featureId)?.close()
    this.sessions.delete(featureId)
    if (project) await removeWorktree(project.path, feature.worktreePath)
    this.store.deleteFeature(featureId)
    this.sink.featureRemoved(featureId)
  }

  shutdown(): void {
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
        permissionMode: feature.permissionMode,
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
    if (event.kind === 'rate_limit' && event.status === 'rejected') patch.limitResetsAt = event.resetsAt ?? null
    if (event.kind === 'user') patch.limitResetsAt = null
    this.patch(featureId, patch)
  }

  private patch(featureId: string, patch: Partial<Feature>): void {
    const before = this.store.getFeature(featureId)
    if (!before) return
    const after: Feature = { ...before, ...patch, updatedAt: Date.now() }
    this.store.updateFeature(after)
    this.sink.feature(after)
    if (after.status !== before.status && needsAttention(after.status)) this.sink.attention(after)
  }
}
