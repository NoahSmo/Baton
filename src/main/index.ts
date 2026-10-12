import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DICTS, LANGS, langFromLocale, type Lang } from '../shared/i18n'
import {
  APP_NAME,
  APP_SLUG,
  type ContextMenuSpec,
  type CreateFeatureInput,
  type Feature,
  type LinearStatus,
  type ConfirmRequest,
  type MenuAction,
  type MenuModel,
  type PermissionDecision,
  type ProjectInput,
  type ProjectPatch
} from '../shared/types'
import { LinearClient } from './linear'
import { Manager } from './manager'
import { contextMenuTemplate, defaultMenuTemplate, type MenuEntry } from './menus'
import { SecretFile } from './secrets'
import { Store } from './store'

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

const dataDir = process.env.ORCHESTRA_DATA_DIR ?? join(homedir(), `.${APP_SLUG}`)

const linearKey = new SecretFile(join(dataDir, 'linear.key'))
const settingsFile = join(dataDir, 'settings.json')

let lang: Lang = 'en'
const t = () => DICTS[lang]

/** Stored choice if there is one, system language otherwise. */
function loadLanguage(): Lang {
  try {
    const stored = JSON.parse(readFileSync(settingsFile, 'utf8')).language
    if (LANGS.includes(stored)) return stored
  } catch {
    // No settings yet.
  }
  return langFromLocale(app.getLocale())
}

const linear = new LinearClient(() => linearKey.get(), t)

let win: BrowserWindow | null = null
let manager: Manager
const attention = new Set<string>()

function send(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

function refreshBadge(): void {
  app.dock?.setBadge(attention.size ? String(attention.size) : '')
}

function notify(feature: Feature): void {
  if (win?.isFocused()) return
  attention.add(feature.id)
  refreshBadge()
  const n = new Notification({ title: feature.title, body: t().attention[feature.status] ?? t().status[feature.status] })
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
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 13 },
    backgroundColor: '#1d1a17',
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

async function confirmRemoveFeature(id: string): Promise<boolean> {
  const feature = manager.getState().features.find((f) => f.id === id)
  if (!feature) return false
  const confirmed = await askConfirm({
    message: t().native.deleteQuestion(feature.title),
    detail: t().native.deleteDetail(feature.branch),
    confirmLabel: t().common.delete,
    danger: true
  })
  if (!confirmed) return false
  await manager.removeFeature(id)
  return true
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
  if (confirmed) manager.removeProject(id)
}

function registerIpc(): void {
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

  ipcMain.handle('feature:create', (_e, input: CreateFeatureInput) => manager.createFeature(input))
  ipcMain.handle('feature:events', (_e, id: string) => manager.getEvents(id))
  ipcMain.handle('feature:send', (_e, id: string, text: string) => manager.send(id, text))
  ipcMain.handle('feature:respond', (_e, id: string, requestId: string, decision: PermissionDecision) =>
    manager.respondPermission(id, requestId, decision)
  )
  ipcMain.handle('feature:interrupt', (_e, id: string) => manager.interrupt(id))

  ipcMain.handle('feature:remove', (_e, id: string) => confirmRemoveFeature(id))
  ipcMain.handle('feature:rename', (_e, id: string, title: string) => manager.renameFeature(id, title))

  ipcMain.handle('menu:open', (_e, spec: ContextMenuSpec) =>
    publishMenu(
      contextMenuTemplate(spec, {
        t: t(),
        manager,
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
    writeFileSync(settingsFile, JSON.stringify({ language: lang }, null, 2))
  })

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
  ipcMain.handle('linear:issues', (_e, linearProjectId?: string) =>
    linearProjectId ? linear.projectIssues(linearProjectId) : linear.myIssues()
  )

  ipcMain.handle('linear:teamStates', (_e, teamId: string) => linear.teamStates(teamId))
  ipcMain.handle('linear:setIssueState', (_e, issueId: string, stateId: string) =>
    linear.setIssueState(issueId, stateId)
  )

  ipcMain.handle('feature:reveal', (_e, id: string) => {
    const feature = manager.getState().features.find((f) => f.id === id)
    if (feature) void shell.openPath(feature.worktreePath)
  })
}

app.setName(APP_NAME)

void app.whenReady().then(() => {
  mkdirSync(dataDir, { recursive: true })
  lang = loadLanguage()
  manager = new Manager(new Store(join(dataDir, 'state.db')), join(dataDir, 'worktrees'), linear, t, {
    event: (ev) => send('event', ev),
    feature: (f) => send('feature', f),
    featureRemoved: (id) => send('feature:removed', id),
    projectRemoved: (id) => send('project:removed', id),
    stream: (id, text) => send('stream', id, text),
    attention: notify
  })
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => manager?.shutdown())
