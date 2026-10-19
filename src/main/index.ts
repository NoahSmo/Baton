import { app, BrowserWindow, dialog, ipcMain, nativeTheme, Notification, shell } from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { DICTS, LANGS, langFromLocale, type Lang } from '../shared/i18n'
import { normalizePrefs, shouldNotify } from '../shared/notifications'
import { formatReset } from '../shared/time'
import { DEFAULT_THEME, themeById, type Theme } from '../shared/themes'
import {
  AGENT_MODELS,
  APP_NAME,
  APP_SLUG,
  DEFAULT_MAX_RUNNING,
  type AgentModel,
  type ContextMenuSpec,
  type CreateFeatureInput,
  type CreateLinearIssueInput,
  type Feature,
  type HandoffDraft,
  type LaunchCommand,
  type LinearIssue,
  type LinearStatus,
  type ConfirmRequest,
  type MenuAction,
  type MenuModel,
  type MessageAttachments,
  type NotificationPrefs,
  PERMISSION_MODES,
  type PermissionDecision,
  type PermissionMode,
  type ProjectInput,
  type ProjectPatch,
  worksInPlace,
  type PromptTemplate,
  type PullRequestDraft,
  type TerminalTarget,
  type UpdateInfo,
  type UsageWarning
} from '../shared/types'
import { readImageUrl, storedFilePath } from './attachments'
import { fileMtime, FileWatchers, listDir, readTextFile, writeTextFile } from './files'
import { gitDirOf, headContent } from './git'
import { draftHandoff } from './handoff'
import { draftPullRequest, pullRequestSupport } from './pullRequest'
import { LinearClient } from './linear'
import { Manager } from './manager'
import { draftCommitMessage } from './commitMessage'
import { suggestCommands } from './suggest'
import { contextMenuTemplate, defaultMenuTemplate, type MenuEntry } from './menus'
import { SecretFile } from './secrets'
import {
  checkForUpdate,
  currentEnv,
  detectInstallMode,
  downloadAsset,
  fetchWithBrew,
  findOwningBrew,
  installScript,
  macAppPath,
  manualUpdateCommand,
  pickAsset,
  runDetached,
  updateDir,
  upgradeWithBrew
} from './updater'
import { Store } from './store'
import { Terminals } from './terminals'

/**
 * An app opened from Finder gets a bare PATH, without Homebrew, node or the
 * user's own tools. Agents run commands, so they need the PATH of a real shell.
 */
function adoptShellPath(): void {
  if (process.platform === 'win32') return
  try {
    const out = execFileSync(process.env.SHELL || '/bin/zsh', ['-ilc', 'printf "__PATH__%s__PATH__" "$PATH"'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const path = out.match(/__PATH__(.*)__PATH__/s)?.[1]
    if (path) process.env.PATH = path
  } catch {
    // Keep the PATH we were given.
  }
}

if (app.isPackaged) adoptShellPath()

const dataDir = process.env.BATON_DATA_DIR ?? join(homedir(), `.${APP_SLUG}`)

const linearKey = new SecretFile(join(dataDir, 'linear.key'))
const settingsFile = join(dataDir, 'settings.json')

let lang: Lang = 'en'
const t = () => DICTS[lang]
let maxRunning = DEFAULT_MAX_RUNNING
let theme: Theme = DEFAULT_THEME
let notificationPrefs: NotificationPrefs = normalizePrefs(undefined)
/** Agent on screen, as the renderer last said. */
let shownFeatureId: string | null = null

function readSettings(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(settingsFile, 'utf8'))
  } catch {
    // No settings yet.
    return {}
  }
}

/** Keeps the settings it is not given. */
function writeSettings(patch: Record<string, unknown>): void {
  writeFileSync(settingsFile, JSON.stringify({ ...readSettings(), ...patch }, null, 2))
}

/** Stored choice if there is one, system language otherwise. */
function loadLanguage(): Lang {
  const stored = readSettings().language as Lang
  return LANGS.includes(stored) ? stored : langFromLocale(app.getLocale())
}

/** Native parts of the window (title bar, scrollbars, pickers) go light or dark with the theme. */
function applyTheme(next: Theme): void {
  theme = next
  nativeTheme.themeSource = next.dark ? 'dark' : 'light'
  win?.setBackgroundColor(next.colors.bg)
}

function loadMaxRunning(): number {
  const stored = readSettings().maxRunningAgents
  return typeof stored === 'number' && Number.isInteger(stored) && stored >= 0 ? stored : DEFAULT_MAX_RUNNING
}

let usageWarning: UsageWarning | null = null

/** Shown even with the window in front: the next agents started could hit the limit. */
function warnUsage(warning: UsageWarning | null): void {
  usageWarning = warning
  send('usage:warning', warning)
  // null: the limit lifted, the warning is gone.
  if (!warning) return
  new Notification({ title: APP_NAME, body: t().notice.limitNear(formatReset(warning.resetsAt, lang), warning.limitType) }).show()
}

const linear = new LinearClient(() => linearKey.get(), t)

let win: BrowserWindow | null = null
let manager: Manager
const attention = new Set<string>()

function send(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

const terminals = new Terminals({
  data: (id, data) => send('terminal:data', id, data),
  exit: (id) => send('terminal:exit', id)
})
const watchers = new FileWatchers((featureId, paths) => send('files:changed', featureId, paths))
// A worktree's git status moves with its files and with git's own state: commits, checkouts, staging.
const gitTreeWatchers = new FileWatchers((featureId) => send('git:changed', featureId))
const gitDirWatchers = new FileWatchers((featureId) => send('git:changed', featureId))

/** A reloaded or closed window has lost its terminals and editors: nothing is left to show them. */
function releaseWindowResources(): void {
  terminals.closeAll()
  watchers.closeAll()
  gitTreeWatchers.closeAll()
  gitDirWatchers.closeAll()
}

function refreshBadge(): void {
  app.dock?.setBadge(attention.size ? String(attention.size) : '')
}

function notify(feature: Feature): void {
  const focused = Boolean(win?.isFocused())
  if (!shouldNotify(notificationPrefs, feature.status, { windowFocused: focused, shownFeatureId, featureId: feature.id })) return
  // The badge counts what the user has not seen: with the window in front, they are looking at it.
  if (!focused) {
    attention.add(feature.id)
    refreshBadge()
  }
  const n = new Notification({
    title: feature.title,
    body: t().attention[feature.status] ?? t().status[feature.status],
    silent: !notificationPrefs.sound
  })
  n.on('click', () => {
    win?.show()
    win?.focus()
    send('feature:focus', feature.id)
  })
  n.show()
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 560,
    title: APP_NAME,
    // Elsewhere the system draws its own title bar.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 13 } } : {}),
    // Linux has no bundle to take the window icon from.
    ...(process.platform === 'linux' ? { icon: app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'build/icons/512x512.png') } : {}),
    backgroundColor: theme.colors.bg,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true
    }
  })
  win.on('focus', () => {
    attention.clear()
    refreshBadge()
  })
  // Links in agent output open in the browser, never inside the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.on('did-start-loading', releaseWindowResources)
  win.on('closed', releaseWindowResources)
  // Right-clicks the renderer does not handle itself: text fields, selections, links.
  win.webContents.on('context-menu', (_e, params) => {
    const entries = defaultMenuTemplate(params, t(), win!.webContents)
    if (entries.length) send('menu:show', publishMenu(entries), { x: params.x, y: params.y })
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

/** The menu currently drawn by the renderer; its actions run here when an item is picked. */
let openMenu: { id: number; entries: MenuEntry[]; chosen: MenuAction | null } | null = null
let lastMenuId = 0

function publishMenu(entries: MenuEntry[]): MenuModel {
  openMenu = { id: ++lastMenuId, entries, chosen: null }
  return {
    menuId: openMenu.id,
    items: entries.map((entry, id) =>
      entry.type === 'separator'
        ? { separator: true }
        : { id, label: entry.label ?? '', enabled: entry.enabled !== false, danger: Boolean(entry.danger) }
    )
  }
}

const pendingConfirms = new Map<number, (confirmed: boolean) => void>()
let lastConfirmId = 0

/** Asks through the app's own dialog rather than a system message box. */
function askConfirm(request: Omit<ConfirmRequest, 'id' | 'cancelLabel'>): Promise<boolean> {
  const id = ++lastConfirmId
  return new Promise((resolve) => {
    pendingConfirms.set(id, resolve)
    send('confirm:show', { id, cancelLabel: t().common.cancel, ...request } satisfies ConfirmRequest)
  })
}

function unwatchGit(featureId: string): void {
  gitTreeWatchers.unwatch(featureId)
  gitDirWatchers.unwatch(featureId)
}

async function confirmRemoveFeature(id: string): Promise<boolean> {
  const feature = manager.getState().features.find((f) => f.id === id)
  if (!feature) return false
  const project = manager.getState().projects.find((p) => p.id === feature.projectId)
  const inPlace = Boolean(project && worksInPlace(feature, project))
  const confirmed = await askConfirm({
    message: t().native.deleteQuestion(feature.title),
    detail: inPlace ? t().native.deleteInPlaceDetail : t().native.deleteDetail(feature.branch),
    confirmLabel: t().common.delete,
    danger: true
  })
  if (!confirmed) return false
  await removeFeature(id)
  return true
}

async function removeFeature(id: string): Promise<void> {
  // Its worktree is about to go: nothing may keep running or watching in it.
  terminals.closeWhere((info) => info.featureId === id)
  watchers.unwatch(id)
  unwatchGit(id)
  await manager.removeFeature(id)
  await removeStrayWorktrees()
}

/** An agent may have added worktrees of its own: with their feature gone, nobody else would clear them. */
async function removeStrayWorktrees(): Promise<void> {
  for (const branch of await manager.removeStrayWorktrees()) {
    new Notification({ title: app.getName(), body: t().native.strayRemoved(branch) }).show()
  }
}

/** Projects Claude is reading to propose launch commands, each with the means to stop it. */
const suggesting = new Map<string, AbortController>()
const drafting = new Map<string, AbortController>()
const draftingPrs = new Map<string, AbortController>()
const draftingHandoffs = new Map<string, AbortController>()

/** Runs a drafting job that a newer request for the same agent, or the user, can cancel. */
async function cancellable<T>(jobs: Map<string, AbortController>, id: string, run: (abort: AbortController) => Promise<T>): Promise<T> {
  jobs.get(id)?.abort()
  const abort = new AbortController()
  jobs.set(id, abort)
  try {
    return await run(abort)
  } finally {
    if (jobs.get(id) === abort) jobs.delete(id)
  }
}

const MERGED_SWEEP_INTERVAL_MS = 15 * 60 * 1000
let sweeping = false

/** A merged feature's worktree only takes up room. Nothing in it is unsaved, so it goes without asking. */
async function removeMergedFeatures(): Promise<void> {
  if (sweeping) return
  sweeping = true
  try {
    await manager.refreshRemotes()
    for (const feature of manager.getState().features) {
      if (!(await manager.isMerged(feature.id))) continue
      await removeFeature(feature.id)
      new Notification({ title: feature.title, body: t().native.mergedRemoved(feature.branch) }).show()
    }
    await removeStrayWorktrees()
  } finally {
    sweeping = false
  }
}

async function confirmRemoveProject(id: string): Promise<void> {
  const project = manager.getState().projects.find((p) => p.id === id)
  if (!project) return
  const confirmed = await askConfirm({
    message: t().native.removeProjectQuestion(project.name),
    detail: t().native.removeProjectDetail,
    confirmLabel: t().native.remove,
    danger: false
  })
  if (!confirmed) return
  manager.removeProject(id)
  terminals.closeWhere((info) => info.projectId === id)
}

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
let update: UpdateInfo | null = null

/** Looks for a newer release; `manual` checks also re-offer a version the user declined. */
async function refreshUpdate(manual = false): Promise<UpdateInfo | null> {
  const found = await checkForUpdate(app.getVersion())
  if (!found) return null
  if (found.version === update?.version) {
    if (manual && update.dismissed) {
      update = { ...update, dismissed: false }
      send('update:available', update)
    }
    return update
  }
  const env = currentEnv()
  const { mode, packager } = app.isPackaged ? detectInstallMode(env) : { mode: 'manual' as const, packager: 'deb' as const }
  const asset = pickAsset(found.assets, found.version, mode, process.arch, packager) ?? undefined
  // Without a package to download there is nothing to install by itself, except through Homebrew.
  const installMode = mode === 'brew' || asset ? mode : 'manual'
  const { assets: _assets, ...release } = found
  update = {
    ...release,
    installMode,
    asset,
    canAutoInstall: installMode !== 'manual',
    dismissed: !manual && readSettings().skippedUpdate === found.version,
    command: manualUpdateCommand()
  }
  send('update:available', update)
  return update
}

/** Quits, and forces the exit if shutdown hangs: the installer is waiting on us. */
function quitForUpdate(): void {
  app.quit()
  setTimeout(() => app.exit(0), 5000).unref()
}

async function installUpdate(): Promise<void> {
  if (!update || update.installMode === 'manual') return
  const log = join(dataDir, 'update.log')
  try {
    if (update.installMode === 'brew') {
      const brew = findOwningBrew()
      if (!brew) throw new Error('Homebrew not found')
      send('update:progress', { phase: 'downloading' })
      await fetchWithBrew(brew)
      send('update:progress', { phase: 'installing' })
      upgradeWithBrew(brew, log, process.pid, macAppPath(process.execPath))
      quitForUpdate()
      return
    }
    if (!update.asset) throw new Error('no package for this platform')
    const file = await downloadAsset(update.asset, updateDir(update.version), (p) => send('update:progress', p))
    send('update:progress', { phase: 'installing' })
    const env = currentEnv()
    runDetached(installScript(update.installMode, file, env, detectInstallMode(env).packager), log)
    quitForUpdate()
  } catch (err) {
    send('update:progress', { phase: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

function registerIpc(): void {
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('update:get', () => update)
  ipcMain.handle('update:check', async () => ({ update: await refreshUpdate(true), version: app.getVersion() }))
  ipcMain.handle('update:install', () => installUpdate())
  ipcMain.handle('update:dismiss', (_e, version: string) => {
    writeSettings({ skippedUpdate: version })
    if (update?.version === version) update = { ...update, dismissed: true }
  })

  ipcMain.handle('state:get', () => manager.getState())

  ipcMain.handle('project:pickFolder', async () => {
    const res = await dialog.showOpenDialog(win!, {
      title: t().native.pickTitle,
      message: t().native.pickMessage,
      properties: ['openDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    return manager.inspectFolder(res.filePaths[0])
  })
  ipcMain.handle('project:create', (_e, input: ProjectInput) => manager.createProject(input))
  ipcMain.handle('project:update', (_e, id: string, patch: ProjectPatch) => manager.updateProject(id, patch))
  ipcMain.handle('project:setCommands', (_e, id: string, commands: LaunchCommand[]) =>
    manager.setProjectCommands(id, commands)
  )
  ipcMain.handle('project:suggestCommands', async (_e, id: string) => {
    const project = manager.getState().projects.find((p) => p.id === id)
    if (!project) throw new Error(t().errors.unknownProject)
    suggesting.get(id)?.abort()
    const abort = new AbortController()
    suggesting.set(id, abort)
    try {
      return await suggestCommands(project.path, lang, abort)
    } finally {
      if (suggesting.get(id) === abort) suggesting.delete(id)
    }
  })
  ipcMain.on('project:cancelSuggestCommands', (_e, id: string) => suggesting.get(id)?.abort())

  ipcMain.handle('project:setTemplates', (_e, id: string, templates: PromptTemplate[]) =>
    manager.setProjectTemplates(id, templates)
  )

  ipcMain.handle('feature:create', (_e, input: CreateFeatureInput) => manager.createFeature(input))
  ipcMain.handle('feature:events', (_e, id: string) => manager.getEvents(id))
  ipcMain.handle('feature:send', (_e, id: string, text: string, attachments?: MessageAttachments) =>
    manager.send(id, text, attachments)
  )
  ipcMain.handle('feature:attachmentUrl', (_e, id: string, name: string) =>
    readImageUrl(manager.attachmentsDir(id), name)
  )
  ipcMain.handle('feature:openAttachment', (_e, id: string, name: string) => {
    const path = storedFilePath(manager.attachmentsDir(id), name)
    if (path) void shell.openPath(path)
  })
  ipcMain.handle('feature:respond', (_e, id: string, requestId: string, decision: PermissionDecision) =>
    manager.respondPermission(id, requestId, decision)
  )
  ipcMain.handle('feature:interrupt', (_e, id: string) => manager.interrupt(id))

  ipcMain.handle('feature:remove', (_e, id: string) => confirmRemoveFeature(id))
  ipcMain.handle('feature:rename', (_e, id: string, title: string) => manager.renameFeature(id, title))
  ipcMain.handle('feature:linkIssue', (_e, id: string, issue: LinearIssue | null) => manager.linkIssue(id, issue))

  ipcMain.handle('menu:open', (_e, spec: ContextMenuSpec) =>
    publishMenu(
      contextMenuTemplate(spec, {
        t: t(),
        manager,
        linearConnected: Boolean(linearKey.get()),
        removeFeature: (id) => void confirmRemoveFeature(id),
        removeProject: (id) => void confirmRemoveProject(id),
        choose: (action) => openMenu && (openMenu.chosen = action)
      })
    )
  )
  ipcMain.handle('menu:run', (_e, menuId: number, itemId: number): MenuAction | null => {
    if (openMenu?.id !== menuId) return null
    const entry = openMenu.entries[itemId]
    if (entry?.enabled !== false) entry?.click?.()
    return openMenu.chosen
  })
  ipcMain.handle('confirm:answer', (_e, id: number, confirmed: boolean) => {
    pendingConfirms.get(id)?.(confirmed)
    pendingConfirms.delete(id)
  })

  ipcMain.handle('language:get', () => lang)
  ipcMain.handle('language:set', (_e, next: Lang) => {
    if (!LANGS.includes(next)) return
    lang = next
    writeSettings({ language: lang })
  })
  ipcMain.handle('theme:get', () => theme.id)
  ipcMain.handle('theme:set', (_e, id: string) => {
    const next = themeById(id)
    if (next.id !== id) return
    applyTheme(next)
    writeSettings({ theme: id })
  })
  ipcMain.handle('settings:maxRunning', () => maxRunning)
  ipcMain.handle('settings:setMaxRunning', (_e, max: number) => {
    if (!Number.isInteger(max) || max < 0) return
    maxRunning = max
    writeSettings({ maxRunningAgents: max })
    manager.startQueued()
  })
  ipcMain.handle('settings:notifications', () => notificationPrefs)
  ipcMain.handle('settings:setNotifications', (_e, prefs: NotificationPrefs) => {
    notificationPrefs = normalizePrefs(prefs)
    writeSettings({ notifications: notificationPrefs })
  })
  ipcMain.on('ui:shownFeature', (_e, id: string | null) => {
    shownFeatureId = typeof id === 'string' ? id : null
  })
  ipcMain.handle('usage:turnCosts', () => manager.turnCosts())
  ipcMain.handle('trash:list', () => manager.trashList())
  ipcMain.handle('trash:restore', (_e, id: string) => manager.trashRestore(id))
  ipcMain.handle('trash:discard', (_e, id: string) => manager.trashDiscard(id))
  ipcMain.handle('feature:setPinned', (_e, id: string, pinned: boolean) => manager.setPinned(id, Boolean(pinned)))
  ipcMain.handle('feature:setArchived', (_e, id: string, archived: boolean) => manager.setArchived(id, Boolean(archived)))
  ipcMain.handle('feature:promote', (_e, id: string) => manager.promoteQueued(id))
  ipcMain.handle('usage:warning', () =>
    usageWarning?.resetsAt && usageWarning.resetsAt * 1000 < Date.now() ? null : usageWarning
  )

  ipcMain.handle('linear:status', async (): Promise<LinearStatus> => {
    if (!linearKey.get()) return { connected: false }
    try {
      return { connected: true, userName: await linear.viewerName() }
    } catch {
      // Offline or key revoked: the key stays, the issue list will report the actual error.
      return { connected: true }
    }
  })
  ipcMain.handle('linear:connect', async (_e, apiKey: string): Promise<LinearStatus> => {
    const key = apiKey.trim()
    const userName = await linear.viewerName(key)
    linearKey.set(key)
    return { connected: true, userName }
  })
  ipcMain.handle('linear:disconnect', () => linearKey.clear())
  ipcMain.handle('linear:projects', () => linear.projects())
  ipcMain.handle('linear:projectLabels', () => linear.projectLabels())
  ipcMain.handle('linear:labelIssues', (_e, labelId: string) => linear.labelIssues(labelId))
  ipcMain.handle('linear:issues', (_e, linearProjectId?: string) =>
    linearProjectId ? linear.projectIssues(linearProjectId) : linear.myIssues()
  )

  ipcMain.handle('linear:createIssue', (_e, input: CreateLinearIssueInput) => linear.createIssue(input))
  ipcMain.handle('linear:teamStates', (_e, teamId: string) => linear.teamStates(teamId))
  ipcMain.handle('linear:setIssueState', (_e, issueId: string, stateId: string) =>
    linear.setIssueState(issueId, stateId)
  )

  ipcMain.handle('feature:setPermissionMode', (_e, id: string, mode: PermissionMode) => {
    if (PERMISSION_MODES.includes(mode)) return manager.setPermissionMode(id, mode)
  })
  ipcMain.handle('feature:setAgentModel', (_e, id: string, model: AgentModel) => {
    if (AGENT_MODELS.includes(model)) return manager.setAgentModel(id, model)
  })

  ipcMain.handle('files:list', (_e, id: string, dir: string) => listDir(manager.featureRoot(id), dir))
  ipcMain.handle('files:read', (_e, id: string, path: string) => readTextFile(manager.featureRoot(id), path))
  ipcMain.handle('files:write', async (_e, id: string, path: string, content: string, mtimeMs: number) => {
    const root = manager.featureRoot(id)
    // The agent may have rewritten the file since the editor loaded it.
    const onDisk = await fileMtime(root, path)
    if (onDisk !== null && onDisk !== mtimeMs) {
      const overwrite = await askConfirm({
        message: t().native.overwriteQuestion(basename(path)),
        detail: t().native.overwriteDetail,
        confirmLabel: t().native.overwrite,
        danger: true
      })
      if (!overwrite) return null
    }
    return writeTextFile(root, path, content)
  })
  ipcMain.handle('files:confirmDiscard', (_e, name: string) =>
    askConfirm({
      message: t().native.discardQuestion(name),
      detail: t().native.discardDetail,
      confirmLabel: t().native.discard,
      danger: true
    })
  )
  ipcMain.handle('files:watch', (_e, id: string) => watchers.watch(id, manager.featureRoot(id)))
  ipcMain.handle('files:unwatch', (_e, id: string) => watchers.unwatch(id))

  ipcMain.handle('git:status', (_e, id: string) => manager.gitStatus(id))
  ipcMain.handle('git:head', (_e, id: string, path: string, ref?: string) => headContent(manager.featureRoot(id), path, ref))
  ipcMain.handle('git:turnChanges', (_e, id: string) => manager.turnChanges(id))
  ipcMain.handle('git:branches', (_e, id: string) => manager.gitBranches(id))
  ipcMain.handle('git:switch', async (_e, id: string, branch: string) => {
    await manager.switchBranch(id, branch)
    send('git:changed', id)
  })
  ipcMain.handle('git:commit', async (_e, id: string, message: string, paths: string[]) => {
    await manager.commitChanges(id, message, paths)
    send('git:changed', id)
  })
  ipcMain.handle('git:draftCommit', async (_e, id: string, paths: string[]) => {
    const root = manager.featureRoot(id)
    drafting.get(id)?.abort()
    const abort = new AbortController()
    drafting.set(id, abort)
    try {
      return await draftCommitMessage(root, paths, abort)
    } finally {
      if (drafting.get(id) === abort) drafting.delete(id)
    }
  })
  ipcMain.on('git:cancelDraftCommit', (_e, id: string) => drafting.get(id)?.abort())
  ipcMain.handle('pr:support', () => pullRequestSupport())
  ipcMain.handle('pr:draft', (_e, id: string) =>
    cancellable(draftingPrs, id, (abort) => draftPullRequest(manager.featureRoot(id), abort))
  )
  ipcMain.on('pr:cancelDraft', (_e, id: string) => draftingPrs.get(id)?.abort())
  ipcMain.handle('pr:create', async (_e, id: string, draft: PullRequestDraft) => {
    const url = await manager.createPullRequest(id, draft)
    send('git:changed', id)
    return url
  })
  ipcMain.handle('handoff:draft', (_e, id: string) => {
    const feature = manager.getState().features.find((f) => f.id === id)
    if (!feature) throw new Error(t().errors.unknownFeature)
    return cancellable(draftingHandoffs, id, (abort) =>
      draftHandoff(feature.worktreePath, t().handoff.title(feature.title), manager.getEvents(id), abort)
    )
  })
  ipcMain.on('handoff:cancelDraft', (_e, id: string) => draftingHandoffs.get(id)?.abort())
  ipcMain.handle('handoff:continue', (_e, id: string, handoff: HandoffDraft) => manager.continueFeature(id, handoff))
  ipcMain.handle('git:pull', async (_e, id: string) => {
    await manager.pull(id)
    send('git:changed', id)
  })
  ipcMain.handle('git:push', async (_e, id: string) => {
    await manager.push(id)
    send('git:changed', id)
  })
  ipcMain.handle('git:watch', (_e, id: string) => {
    const root = manager.featureRoot(id)
    const gitDir = gitDirOf(root)
    gitTreeWatchers.watch(id, root)
    if (gitDir) gitDirWatchers.watch(id, gitDir)
  })
  ipcMain.handle('git:unwatch', (_e, id: string) => unwatchGit(id))

  ipcMain.handle('terminal:open', (_e, target: TerminalTarget, commandId?: string) => {
    const { projects, features } = manager.getState()
    const feature = 'featureId' in target ? features.find((f) => f.id === target.featureId) : null
    if ('featureId' in target && !feature) throw new Error(t().errors.unknownFeature)
    const project = projects.find((p) => p.id === (feature ? feature.projectId : (target as { projectId: string }).projectId))
    if (!project) throw new Error(t().errors.unknownProject)
    // Looked up here: only a command the user configured is ever typed for them.
    const launch = commandId ? project.commands.find((c) => c.id === commandId) : undefined
    if (commandId && !launch) throw new Error(t().errors.unknownCommand)
    return terminals.open(
      { projectId: project.id, featureId: feature?.id ?? null, cwd: feature ? feature.worktreePath : project.path },
      launch
    )
  })
  ipcMain.on('terminal:write', (_e, id: string, data: string) => terminals.write(id, data))
  ipcMain.on('terminal:resize', (_e, id: string, cols: number, rows: number) => terminals.resize(id, cols, rows))
  ipcMain.handle('terminal:close', (_e, id: string) => terminals.close(id))

  ipcMain.handle('feature:reveal', (_e, id: string) => {
    const feature = manager.getState().features.find((f) => f.id === id)
    if (feature) void shell.openPath(feature.worktreePath)
  })
}

app.setName(APP_NAME)

void app.whenReady().then(() => {
  mkdirSync(dataDir, { recursive: true })
  lang = loadLanguage()
  applyTheme(themeById(readSettings().theme))
  maxRunning = loadMaxRunning()
  notificationPrefs = normalizePrefs(readSettings().notifications)
  manager = new Manager(new Store(join(dataDir, 'state.db')), join(dataDir, 'worktrees'), join(dataDir, 'attachments'), join(dataDir, 'trash'), linear, t, () => maxRunning, {
    event: (ev) => send('event', ev),
    feature: (f) => send('feature', f),
    featureRemoved: (id) => send('feature:removed', id),
    projectRemoved: (id) => send('project:removed', id),
    stream: (id, text) => send('stream', id, text),
    backgroundTasks: (id, tasks) => send('background', id, tasks),
    attention: notify,
    usageWarning: warnUsage
  })
  // In development the Dock shows the icon of the Electron bundle, not the app's.
  if (!app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'build/icon.png'))
  registerIpc()
  createWindow()
  setTimeout(() => void refreshUpdate(), 5000)
  setInterval(() => void refreshUpdate(), UPDATE_CHECK_INTERVAL_MS)
  void manager.trashList()
  void removeMergedFeatures()
  setInterval(() => void removeMergedFeatures(), MERGED_SWEEP_INTERVAL_MS)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  manager?.shutdown()
  releaseWindowResources()
})
