import { clipboard, shell } from 'electron'
import { spawn } from 'node:child_process'
import type { Dict } from '../shared/i18n'
import type { ContextMenuSpec, MenuAction } from '../shared/types'
import type { Manager } from './manager'

export interface MenuContext {
  t: Dict
  manager: Manager
  /** Issues can only be picked while Linear is connected. */
  linearConnected: boolean
  /** Ask for confirmation, then delete. */
  removeFeature(featureId: string): void
  removeProject(projectId: string): void
  /** Hands an action that needs the renderer's UI back to it. */
  choose(action: MenuAction): void
}

/** One line of a context menu. The renderer draws it; `click` runs here when it is picked. */
export interface MenuEntry {
  type?: 'separator'
  label?: string
  enabled?: boolean
  /** Destructive action, drawn accordingly. */
  danger?: boolean
  click?(): void
}

/** Clipboard commands of the focused web contents. */
export interface EditCommands {
  cut(): void
  copy(): void
  paste(): void
  selectAll(): void
}

const separator: MenuEntry = { type: 'separator' }

function openInTerminal(path: string): void {
  spawn('open', ['-a', 'Terminal', path], { detached: true, stdio: 'ignore' }).unref()
}

export function contextMenuTemplate(spec: ContextMenuSpec, ctx: MenuContext): MenuEntry[] {
  const { t, manager } = ctx
  const state = manager.getState()
  const isMac = process.platform === 'darwin'

  switch (spec.kind) {
    case 'feature': {
      const feature = state.features.find((f) => f.id === spec.featureId)
      if (!feature) return []
      const busy = feature.status === 'working' || feature.status === 'waiting'
      const linear = feature.linear
      return [
        { label: t.feature.openFolder, click: () => void shell.openPath(feature.worktreePath) },
        ...(isMac ? [{ label: t.menu.openTerminal, click: () => openInTerminal(feature.worktreePath) }] : []),
        ...(linear
          ? [
              { label: t.menu.openIssue(linear.identifier), click: () => void shell.openExternal(linear.url) },
              { label: t.menu.unlinkIssue(linear.identifier), click: () => manager.linkIssue(feature.id, null) }
            ]
          : ctx.linearConnected
            ? [{ label: t.menu.linkIssue, click: () => ctx.choose('link-feature') }]
            : []),
        separator,
        { label: t.menu.copyBranch, click: () => clipboard.writeText(feature.branch) },
        { label: t.menu.copyPath, click: () => clipboard.writeText(feature.worktreePath) },
        separator,
        { label: t.feature.stop, enabled: busy, click: () => void manager.interrupt(feature.id) },
        ...(feature.status === 'queued' && (feature.queuePosition ?? 1) > 1
          ? [{ label: t.menu.moveFirst, click: () => manager.promoteQueued(feature.id) }]
          : []),
        { label: t.menu.rename, click: () => ctx.choose('rename-feature') },
        { label: feature.pinned ? t.menu.unpin : t.menu.pin, click: () => manager.setPinned(feature.id, !feature.pinned) },
        {
          label: feature.archived ? t.menu.unarchive : t.menu.archive,
          click: () => manager.setArchived(feature.id, !feature.archived)
        },
        { label: t.menu.continueNew, enabled: Boolean(feature.sessionId), click: () => ctx.choose('continue-feature') },
        separator,
        { label: t.menu.delete, danger: true, click: () => ctx.removeFeature(feature.id) }
      ]
    }

    case 'project': {
      const project = state.projects.find((p) => p.id === spec.projectId)
      if (!project) return []
      const hasFeatures = state.features.some((f) => f.projectId === project.id)
      return [
        { label: t.sidebar.newFeature, click: () => ctx.choose('new-feature') },
        { label: t.menu.settings, click: () => ctx.choose('project-settings') },
        separator,
        { label: t.feature.openFolder, click: () => void shell.openPath(project.path) },
        ...(isMac ? [{ label: t.menu.openTerminal, click: () => openInTerminal(project.path) }] : []),
        { label: t.menu.copyPath, click: () => clipboard.writeText(project.path) },
        separator,
        // Features hold worktrees inside the repo: they have to go first.
        {
          label: t.menu.removeProject,
          enabled: !hasFeatures,
          danger: true,
          click: () => ctx.removeProject(project.id)
        }
      ]
    }

    case 'issue':
      return [
        { label: t.menu.openIssue(spec.identifier), click: () => void shell.openExternal(spec.url) },
        separator,
        { label: t.menu.copyIdentifier, click: () => clipboard.writeText(spec.identifier) },
        { label: t.menu.copyBranch, click: () => clipboard.writeText(spec.branchName) },
        { label: t.menu.copyLink, click: () => clipboard.writeText(spec.url) }
      ]

    case 'text':
      return spec.entries
        .filter((e) => e.text)
        .map((e) => ({ label: t.menu.copyEntry[e.label], click: () => clipboard.writeText(e.text) }))
  }
}

/** Menu for plain right-clicks: text fields, selections and links. */
export function defaultMenuTemplate(
  params: { isEditable: boolean; selectionText: string; linkURL: string },
  t: Dict,
  edit: EditCommands
): MenuEntry[] {
  if (params.isEditable) {
    return [
      { label: t.menu.cut, enabled: Boolean(params.selectionText), click: () => edit.cut() },
      { label: t.menu.copy, enabled: Boolean(params.selectionText), click: () => edit.copy() },
      { label: t.menu.paste, click: () => edit.paste() },
      separator,
      { label: t.menu.selectAll, click: () => edit.selectAll() }
    ]
  }
  const items: MenuEntry[] = []
  if (/^https?:/.test(params.linkURL)) {
    items.push(
      { label: t.menu.openLink, click: () => void shell.openExternal(params.linkURL) },
      { label: t.menu.copyLink, click: () => clipboard.writeText(params.linkURL) }
    )
  }
  if (params.selectionText.trim()) {
    if (items.length) items.push(separator)
    items.push({ label: t.menu.copy, click: () => edit.copy() })
  }
  return items
}
