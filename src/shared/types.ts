import type { Lang } from './i18n'

// Single place to rename the app.
export const APP_NAME = 'OrchestraClaude'
export const APP_SLUG = 'orchestra-claude'

export type FeatureStatus =
  | 'idle' // no turn running, nothing to report
  | 'working' // agent is running a turn
  | 'waiting' // agent needs an answer (permission or question)
  | 'done' // last turn finished successfully
  | 'error' // last turn failed
  | 'limited' // usage limit reached

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'

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

export interface LinearProject {
  id: string
  name: string
}

export interface Project {
  id: string
  name: string
  path: string
  color: string
  /** When set, only issues of this Linear project are offered for the repo. */
  linearProject: LinearProject | null
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
  linearProject: LinearProject | null
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
  sessionId: string | null
  model: string | null
  costUsd: number
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

/** Persisted, ordered transcript entries for a feature. */
export type UiEvent =
  | { kind: 'user'; text: string }
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
  | { kind: 'rate_limit'; status: 'allowed' | 'allowed_warning' | 'rejected'; resetsAt?: number; limitType?: string }
  | { kind: 'error'; message: string }
  | { kind: 'notice'; notice?: Notice; /** Sentence stored by versions predating translations. */ text?: string }

/** App-authored transcript lines, stored as data so they render in the current language. */
export type Notice =
  | { code: 'app_closed' }
  | { code: 'linear_moved'; identifier: string; state: string }
  | { code: 'linear_failed'; identifier: string; reason: string }

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
  permissionMode: PermissionMode
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
export type MenuAction = 'rename-feature' | 'new-feature' | 'project-settings'

export interface AppState {
  projects: Project[]
  features: Feature[]
}

/** Surface exposed to the renderer through the preload bridge. */
export interface Api {
  getState(): Promise<AppState>
  pickProjectFolder(): Promise<RepoInfo | null>
  createProject(input: ProjectInput): Promise<Project>
  updateProject(projectId: string, patch: ProjectPatch): Promise<Project>
  createFeature(input: CreateFeatureInput): Promise<Feature>
  getEvents(featureId: string): Promise<StoredEvent[]>
  send(featureId: string, text: string): Promise<void>
  respondPermission(featureId: string, requestId: string, decision: PermissionDecision): Promise<void>
  interrupt(featureId: string): Promise<void>
  removeFeature(featureId: string): Promise<boolean>
  reveal(featureId: string): Promise<void>
  renameFeature(featureId: string, title: string): Promise<void>
  /** Builds the context menu for a target; the renderer draws it. */
  menuOpen(spec: ContextMenuSpec): Promise<MenuModel>
  /** Runs an item of the menu last opened. */
  menuRun(menuId: number, itemId: number): Promise<MenuAction | null>
  /** Menu for a plain right-click on a text field, a selection or a link. */
  onMenuShow(cb: (menu: MenuModel, point: { x: number; y: number }) => void): () => void
  onConfirm(cb: (request: ConfirmRequest) => void): () => void
  answerConfirm(id: number, confirmed: boolean): Promise<void>
  onProjectRemoved(cb: (projectId: string) => void): () => void
  getLanguage(): Promise<Lang>
  setLanguage(lang: Lang): Promise<void>
  linearStatus(): Promise<LinearStatus>
  /** Validates the API key against Linear before storing it. */
  linearConnect(apiKey: string): Promise<LinearStatus>
  linearDisconnect(): Promise<void>
  linearProjects(): Promise<LinearProject[]>
  /** Open issues of a Linear project, or the user's assigned issues when none is given. */
  linearIssues(linearProjectId?: string): Promise<LinearIssue[]>
  /** Workflow states an issue of this team can be moved to, in workflow order. */
  linearTeamStates(teamId: string): Promise<LinearState[]>
  linearSetIssueState(issueId: string, stateId: string): Promise<void>
  onEvent(cb: (ev: StoredEvent) => void): () => void
  onFeature(cb: (feature: Feature) => void): () => void
  onFeatureRemoved(cb: (featureId: string) => void): () => void
  /** Live text of the assistant message being streamed; empty string clears it. */
  onStream(cb: (featureId: string, text: string) => void): () => void
  /** Fired when the user clicks a notification for a feature. */
  onFocusFeature(cb: (featureId: string) => void): () => void
}
