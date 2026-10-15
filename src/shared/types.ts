import type { Lang } from './i18n'

// Single place to rename the app.
export const APP_NAME = 'Baton'
export const APP_SLUG = 'baton'
/** Where releases are published and how Homebrew knows the app. */
export const GITHUB_REPO = 'NoahSmo/Baton'
export const BREW_CASK = 'noahsmo/tap/baton'
/** Installs or upgrades the app on Linux. */
export const LINUX_INSTALL_COMMAND = `curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/install.sh | sh`

export type UpdateInstallMode = 'brew' | 'mac-zip' | 'linux-user' | 'linux-pkg' | 'manual'

export interface UpdateAsset {
  name: string
  url: string
  sha256?: string
}

export interface UpdateProgress {
  phase: 'downloading' | 'installing' | 'error'
  received?: number
  total?: number
  message?: string
}

export interface UpdateInfo {
  version: string
  /** Release page. */
  url: string
  notes: string
  /** The app can replace itself: through Homebrew, or from the release's own package. */
  canAutoInstall: boolean
  /** How the update gets installed. */
  installMode: UpdateInstallMode
  /** Release package for this platform; absent for Homebrew and manual installs. */
  asset?: UpdateAsset
  /** The user already declined this version: no popup, the status bar button stays. */
  dismissed: boolean
  /** What the user runs to update by hand otherwise. */
  command: string
}

export type FeatureStatus =
  | 'idle' // no turn running, nothing to report
  | 'working' // agent is running a turn
  | 'waiting' // agent needs an answer (permission or question)
  | 'done' // last turn finished successfully
  | 'error' // last turn failed
  | 'limited' // usage limit reached
  | 'queued' // message waiting for a free agent slot

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'

export const PERMISSION_MODES: PermissionMode[] = ['default', 'acceptEdits', 'plan', 'bypassPermissions']

/** Model an agent runs on, as Claude Code aliases it. */
export type AgentModel = 'sonnet' | 'opus'

export const AGENT_MODELS: AgentModel[] = ['sonnet', 'opus']

/** Opus spends the usage limit several times faster: it is picked per agent, never by default. */
export const DEFAULT_AGENT_MODEL: AgentModel = 'sonnet'

/** How many agents may run a turn at once by default; the others wait their turn. */
export const DEFAULT_MAX_RUNNING = 2

/** A usage window close to its limit, as last reported by an agent. */
export interface UsageWarning {
  limitType?: string
  /** Epoch seconds. */
  resetsAt?: number
  /** Share of the window used, from 0 to 1, when reported. */
  utilization?: number
}

export const PROJECT_COLORS = [
  '#e08e62',
  '#b392e6',
  '#12b8bf',
  '#6cbb7a',
  '#62a5ec',
  '#e07fa2',
  '#e6807a',
  '#d2964a',
  '#a9ab4c',
  '#3bbba0',
  '#38b0dc',
  '#929df0',
  '#cf8bcf',
  '#c9bcae'
] as const

/** A Linear project label. Repositories are linked to one. */
export interface LinearLabel {
  id: string
  name: string
}

export interface LinearTeam {
  id: string
  name: string
}

export interface LinearProject {
  id: string
  name: string
  labels: LinearLabel[]
  teams: LinearTeam[]
}

export interface CreateLinearIssueInput {
  title: string
  description: string
  teamId: string
  projectId: string
}

/** A shell command of a project the user starts with one click, e.g. its dev server. */
export interface LaunchCommand {
  id: string
  /** What the button reads; the command itself when left empty. */
  name: string
  command: string
}

/** A launch command Claude proposes after reading the project; the user decides whether it is kept. */
export type LaunchSuggestion = Omit<LaunchCommand, 'id'>

export interface Project {
  id: string
  name: string
  path: string
  color: string
  /** When set, the issues of every Linear project carrying this label belong to the repo. */
  linearLabel: LinearLabel | null
  commands: LaunchCommand[]
}

/** What the folder picker found, shown before a project is created. */
export interface RepoInfo {
  path: string
  name: string
  isGit: boolean
  branch: string | null
  changedFiles: number
  /** Id of the project already using this folder, if any. */
  existingProjectId: string | null
}

export interface ProjectInput {
  path: string
  name: string
  color: string
  linearLabel: LinearLabel | null
}

export type ProjectPatch = Omit<ProjectInput, 'path'>

/** Link from a feature to the Linear issue it was created from. */
export interface LinearLink {
  issueId: string
  identifier: string
  url: string
}

export interface LinearIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  url: string
  /** Branch name Linear suggests; using it lets Linear attach the pull request to the issue. */
  branchName: string
  stateName: string
  /** Linear's workflow category: triage, backlog, unstarted, started… */
  stateType: string
  stateId: string
  teamId: string
  linearProjectId: string | null
  assigneeName: string | null
}

export interface LinearState {
  id: string
  name: string
  type: string
  position: number
}

export interface LinearStatus {
  connected: boolean
  userName?: string
}

export interface Feature {
  id: string
  projectId: string
  title: string
  linear: LinearLink | null
  branch: string
  worktreePath: string
  status: FeatureStatus
  permissionMode: PermissionMode
  agentModel: AgentModel
  sessionId: string | null
  /** Model the session actually reported, e.g. "claude-sonnet-5". */
  model: string | null
  costUsd: number
  /** Size of the conversation at the last request, in tokens; every request sends all of it again. */
  contextTokens: number
  /** Epoch seconds at which the usage limit resets, when status is 'limited'. */
  limitResetsAt: number | null
  createdAt: number
  updatedAt: number
}

export interface QuestionOption {
  label: string
  description?: string
}

export interface Question {
  question: string
  header?: string
  options: QuestionOption[]
  multiSelect?: boolean
}

/** Image formats the model reads. */
export const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number]

/** An image on its way to the agent, base64-encoded. */
export interface ImageInput {
  mediaType: ImageMediaType
  data: string
}

/** An image of the journal, named after its file among the feature's attachments. */
export interface ImageRef {
  name: string
  mediaType: ImageMediaType
}

/** Heaviest document copied next to a feature. */
export const MAX_ATTACHED_FILE_BYTES = 100 * 1024 * 1024

/** A document of the journal: the agent is given its path and reads it with its own tools. */
export interface FileRef {
  /** File among the feature's attachments. */
  name: string
  /** Name the user knows it by. */
  label: string
  size: number
}

/** What goes with a message besides its text. */
export interface MessageAttachments {
  images?: ImageInput[]
  /** Paths of documents to hand over to the agent. */
  files?: string[]
}

/** Persisted, ordered transcript entries for a feature. */
export type UiEvent =
  | { kind: 'user'; text: string; images?: ImageRef[]; files?: FileRef[] }
  | { kind: 'assistant_text'; text: string }
  | { kind: 'tool_use'; toolUseId: string; name: string; input: Record<string, unknown> }
  | { kind: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | {
      kind: 'permission_request'
      requestId: string
      toolName: string
      input: Record<string, unknown>
      canAlwaysAllow: boolean
      reason?: string
    }
  | { kind: 'permission_resolved'; requestId: string; behavior: 'allow' | 'deny' }
  | { kind: 'result'; isError: boolean; interrupted: boolean; text: string; turnCostUsd: number }
  | {
      kind: 'rate_limit'
      status: 'allowed' | 'allowed_warning' | 'rejected'
      resetsAt?: number
      limitType?: string
      utilization?: number
    }
  | { kind: 'error'; message: string }
  | { kind: 'notice'; notice?: Notice; /** Sentence stored by versions predating translations. */ text?: string }

/** App-authored transcript lines, stored as data so they render in the current language. */
export type Notice =
  | { code: 'app_closed' }
  | { code: 'linear_moved'; identifier: string; state: string }
  | { code: 'linear_failed'; identifier: string; reason: string }
  | { code: 'context_compacted'; preTokens: number; postTokens?: number }
  | { code: 'queued'; maxRunning: number }

export interface StoredEvent {
  seq: number
  featureId: string
  at: number
  event: UiEvent
}

export type PermissionDecision =
  | { behavior: 'allow'; always?: boolean; answers?: Record<string, string> }
  | { behavior: 'deny'; message?: string }

export interface CreateFeatureInput {
  projectId: string
  title: string
  prompt: string
  /** Images and documents sent along with the prompt. */
  attachments?: MessageAttachments
  permissionMode: PermissionMode
  agentModel: AgentModel
  linearIssue?: LinearIssue
}

export type ContextMenuSpec =
  | { kind: 'feature'; featureId: string }
  | { kind: 'project'; projectId: string }
  | { kind: 'issue'; identifier: string; url: string; branchName: string }
  | { kind: 'text'; entries: { label: 'message' | 'input' | 'output'; text: string }[] }

/** A context menu as the renderer draws it; the actions themselves stay in the main process. */
export interface MenuModel {
  menuId: number
  items: ({ separator: true } | { separator?: false; id: number; label: string; enabled: boolean; danger: boolean })[]
}

/** A yes/no question the main process needs answered before a destructive action. */
export interface ConfirmRequest {
  id: number
  message: string
  detail: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
}

/** Menu choices handed back to the renderer because they need its UI. */
export type MenuAction = 'rename-feature' | 'link-feature' | 'new-feature' | 'project-settings'

export interface AppState {
  projects: Project[]
  features: Feature[]
}

/** An entry of a feature's worktree. Paths are relative to the worktree, with forward slashes. */
export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
}

export type FileContent =
  | { kind: 'text'; content: string; mtimeMs: number }
  | { kind: 'binary' }
  | { kind: 'too_large'; size: number }

export type GitChangeKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'

/** A file of a worktree that differs from its last commit. */
export interface GitChange {
  /** Relative to the worktree, with forward slashes. */
  path: string
  kind: GitChangeKind
  /** Where a renamed file came from. */
  from?: string
}

export interface GitStatus {
  /** Null on a detached HEAD. */
  branch: string | null
  /** Short id of the commit checked out. */
  head: string
  upstream: string | null
  /** Commits not pushed to the upstream, and commits of the upstream not pulled. */
  ahead: number
  behind: number
  changes: GitChange[]
}

export interface GitBranch {
  name: string
  current: boolean
  /** Exists on a remote only; switching to it creates the local branch. */
  remote: boolean
  /** Who has the branch checked out already: git allows a branch in one worktree at a time. */
  heldBy: string | null
}

/** Where a terminal starts: the project's folder, or the worktree of one of its features. */
export type TerminalTarget = { projectId: string } | { featureId: string }

export interface TerminalInfo {
  id: string
  projectId: string
  /** Set when the terminal was opened in a feature's worktree. */
  featureId: string | null
  cwd: string
  /** Name of the shell, e.g. "zsh". */
  shell: string
  /** Name of the launch command the terminal was started for, if any. */
  command: string | null
  /** Id of that launch command, which tells the sidebar what is running. */
  commandId: string | null
}

/** Surface exposed to the renderer through the preload bridge. */
export interface Api {
  getState(): Promise<AppState>
  pickProjectFolder(): Promise<RepoInfo | null>
  createProject(input: ProjectInput): Promise<Project>
  updateProject(projectId: string, patch: ProjectPatch): Promise<Project>
  /** Replaces the launch commands of a project; those without a command are dropped. */
  setProjectCommands(projectId: string, commands: LaunchCommand[]): Promise<Project>
  /** Has Claude read the project, without changing it, and propose its launch commands. */
  suggestCommands(projectId: string): Promise<LaunchSuggestion[]>
  /** Stops the reading under way; its promise rejects. */
  cancelSuggestCommands(projectId: string): void
  createFeature(input: CreateFeatureInput): Promise<Feature>
  getEvents(featureId: string): Promise<StoredEvent[]>
  send(featureId: string, text: string, attachments?: MessageAttachments): Promise<void>
  /** Path on disk of a file picked, dropped or pasted; empty when there is none behind it. */
  pathForFile(file: File): string
  /** Data URL of an image sent earlier, null once its file is gone. */
  attachmentUrl(featureId: string, name: string): Promise<string | null>
  /** Opens a document sent earlier in the app the system uses for it. */
  openAttachment(featureId: string, name: string): Promise<void>
  respondPermission(featureId: string, requestId: string, decision: PermissionDecision): Promise<void>
  interrupt(featureId: string): Promise<void>
  removeFeature(featureId: string): Promise<boolean>
  reveal(featureId: string): Promise<void>
  renameFeature(featureId: string, title: string): Promise<void>
  /** Ties an agent to a Linear issue once it exists; null unties it. */
  linkIssue(featureId: string, issue: LinearIssue | null): Promise<void>
  /** Changes how much the agent may do on its own, mid-turn included. */
  setPermissionMode(featureId: string, mode: PermissionMode): Promise<void>
  /** Applies from the agent's next request. */
  setAgentModel(featureId: string, model: AgentModel): Promise<void>
  getMaxRunning(): Promise<number>
  /** 0 lifts the limit. */
  setMaxRunning(max: number): Promise<void>
  /** The last warning that a usage window is nearly used up, if any. */
  getUsageWarning(): Promise<UsageWarning | null>
  onUsageWarning(cb: (warning: UsageWarning | null) => void): () => void
  /** Builds the context menu for a target; the renderer draws it. */
  menuOpen(spec: ContextMenuSpec): Promise<MenuModel>
  /** Runs an item of the menu last opened. */
  menuRun(menuId: number, itemId: number): Promise<MenuAction | null>
  /** Menu for a plain right-click on a text field, a selection or a link. */
  onMenuShow(cb: (menu: MenuModel, point: { x: number; y: number }) => void): () => void
  onConfirm(cb: (request: ConfirmRequest) => void): () => void
  answerConfirm(id: number, confirmed: boolean): Promise<void>
  onProjectRemoved(cb: (projectId: string) => void): () => void
  getVersion(): Promise<string>
  /** The newer release found by the last check, if any. */
  getUpdate(): Promise<UpdateInfo | null>
  /** Downloads and installs the update; the app quits, is replaced and reopens. */
  installUpdate(): Promise<void>
  /** Remembers that this version was declined, so it is not offered again on its own. */
  dismissUpdate(version: string): Promise<void>
  onUpdate(cb: (update: UpdateInfo) => void): () => void
  onUpdateProgress(cb: (progress: UpdateProgress) => void): () => void
  getLanguage(): Promise<Lang>
  setLanguage(lang: Lang): Promise<void>
  /** Id of the chosen theme, from shared/themes. */
  getTheme(): Promise<string>
  setTheme(id: string): Promise<void>
  linearStatus(): Promise<LinearStatus>
  /** Validates the API key against Linear before storing it. */
  linearConnect(apiKey: string): Promise<LinearStatus>
  linearDisconnect(): Promise<void>
  linearProjects(): Promise<LinearProject[]>
  linearProjectLabels(): Promise<LinearLabel[]>
  /** Open issues of every Linear project carrying a label. */
  linearLabelIssues(labelId: string): Promise<LinearIssue[]>
  /** Open issues of a Linear project, or the user's assigned issues when none is given. */
  linearIssues(linearProjectId?: string): Promise<LinearIssue[]>
  /** Workflow states an issue of this team can be moved to, in workflow order. */
  linearTeamStates(teamId: string): Promise<LinearState[]>
  linearSetIssueState(issueId: string, stateId: string): Promise<void>
  linearCreateIssue(input: CreateLinearIssueInput): Promise<LinearIssue>
  onEvent(cb: (ev: StoredEvent) => void): () => void
  onFeature(cb: (feature: Feature) => void): () => void
  onFeatureRemoved(cb: (featureId: string) => void): () => void
  /** Live text of the assistant message being streamed; empty string clears it. */
  onStream(cb: (featureId: string, text: string) => void): () => void
  /** Fired when the user clicks a notification for a feature. */
  onFocusFeature(cb: (featureId: string) => void): () => void
  /** Entries of a directory of the feature's worktree; '' is its root. */
  filesList(featureId: string, dir: string): Promise<FileEntry[]>
  fileRead(featureId: string, path: string): Promise<FileContent>
  /**
   * Saves a file. `mtimeMs` is the version the editor loaded: when the file changed
   * on disk since, the user is asked first. Resolves with the new mtime, or null when kept.
   */
  fileWrite(featureId: string, path: string, content: string, mtimeMs: number): Promise<number | null>
  /** Asks before throwing away unsaved changes. */
  confirmDiscard(name: string): Promise<boolean>
  filesWatch(featureId: string): Promise<void>
  filesUnwatch(featureId: string): Promise<void>
  /** Paths that changed in a watched worktree; an empty list means too many to name. */
  onFilesChanged(cb: (featureId: string, paths: string[]) => void): () => void
  /** Branch and changed files of the feature's worktree. */
  gitStatus(featureId: string): Promise<GitStatus>
  /** A file as the last commit has it; null when absent there or not diffable. */
  gitHead(featureId: string, path: string): Promise<string | null>
  gitBranches(featureId: string): Promise<GitBranch[]>
  /** Checks another branch out in the feature's worktree. Rejects with git's own explanation. */
  gitSwitch(featureId: string, branch: string): Promise<void>
  /** Commits the given changes, and only those. Rejects with git's own explanation. */
  gitCommit(featureId: string, message: string, paths: string[]): Promise<void>
  gitPull(featureId: string): Promise<void>
  /** Publishes the branch when it has no upstream yet. */
  gitPush(featureId: string): Promise<void>
  gitWatch(featureId: string): Promise<void>
  gitUnwatch(featureId: string): Promise<void>
  /** The status of a watched worktree may have changed. */
  onGitChanged(cb: (featureId: string) => void): () => void
  /** Starts a shell; with `commandId`, it runs that launch command of the project right away. */
  terminalOpen(target: TerminalTarget, commandId?: string): Promise<TerminalInfo>
  terminalWrite(id: string, data: string): void
  terminalResize(id: string, cols: number, rows: number): void
  terminalClose(id: string): Promise<void>
  onTerminalData(cb: (id: string, data: string) => void): () => void
  /** The shell ended, or its feature or project was removed. */
  onTerminalExit(cb: (id: string) => void): () => void
}
