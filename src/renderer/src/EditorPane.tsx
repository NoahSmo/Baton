import { indentWithTab } from '@codemirror/commands'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { EditorState, Transaction, type Extension, type Text } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { openContextMenu } from './contextMenu'
import type { Feature, FileEntry, GitChange, GitChangeKind, GitStatus } from '../../shared/types'
import { DiffView } from './DiffView'
import { GitActions } from './GitActions'
import { editorTheme } from './editorTheme'
import { HistoryGraph } from './HistoryGraph'
import { PullRequestStatusCard } from './PullRequestStatusCard'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'
import { Icon } from './ui/Icon'

interface Props {
  feature: Feature
  /** A hidden editor stays mounted, so open files and unsaved changes survive. */
  visible: boolean
  /** Width beside the conversation, or height when stacked below it. */
  size: { width: number } | { height: number }
  /** Status of the worktree; null while unknown or hidden. */
  git: GitStatus | null
  /** Which list the side column shows. */
  panel: EditorPanel
  onPanel(panel: EditorPanel): void
}

export type EditorPanel = 'files' | 'changes' | 'history' | 'pr'

/** Letter a changed file is tagged with, as git and most editors do. */
const CHANGE_MARK: Record<GitChangeKind, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
  conflicted: '!'
}

interface Tab {
  path: string
  name: string
  status: 'loading' | 'text' | 'binary' | 'too_large' | 'unreadable'
  dirty: boolean
  /** Changed on disk while holding unsaved changes. */
  stale: boolean
  megabytes?: string
}

/** What an open file keeps while another tab is showing: text, cursor and undo history. */
interface Buffer {
  state: EditorState
  /** Content as last read from or written to disk. */
  saved: Text
  mtimeMs: number
}

const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

/** File tree and code editor over a feature's worktree. */
export function EditorPane({ feature, visible, size, git, panel, onPanel }: Props) {
  const t = useT()
  const id = feature.id
  /** Loaded directories, by path; '' is the root. */
  const [dirs, setDirs] = useState<Record<string, FileEntry[]>>({})
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** File whose diff fills the editor, picked from the changes list. */
  const [diffPath, setDiffPath] = useState<string | null>(null)
  /** Changes since the last commit, or since the agent's last turn began. */
  const [changesMode, setChangesMode] = useState<'commit' | 'turn'>('commit')
  /** Undefined while loading; null when no snapshot of the turn exists. */
  const [turn, setTurn] = useState<{ base: string; changes: GitChange[] } | null | undefined>(undefined)
  /** A name being typed in the tree: for a new entry inside `dir`, or for the entry `path` being renamed. */
  const [naming, setNaming] = useState<{ kind: 'create'; dir: string; isDirectory: boolean } | { kind: 'rename'; path: string } | null>(null)
  const buffers = useRef(new Map<string, Buffer>())
  const view = useRef<EditorView | null>(null)
  const host = useRef<HTMLDivElement>(null)

  const active = tabs.find((tab) => tab.path === activePath) ?? null
  const commitChanges = git?.changes ?? []
  const changes = changesMode === 'turn' ? (turn?.changes ?? []) : commitChanges

  // The turn's changes follow the worktree like the status does.
  useEffect(() => {
    if (changesMode !== 'turn' || !visible) return
    let stale = false
    window.api
      .gitTurnChanges(id)
      .then((result) => !stale && setTurn(result))
      .catch(() => !stale && setTurn(null))
    return () => {
      stale = true
    }
  }, [changesMode, visible, id, git, feature.turnBase])

  /** Changed files by path, and the folders leading to them. */
  const changed = useMemo(() => {
    const kinds = new Map<string, GitChangeKind | 'inside'>()
    for (const change of commitChanges) {
      kinds.set(change.path, change.kind)
      for (let dir = parentOf(change.path); dir && !kinds.has(dir); dir = parentOf(dir)) kinds.set(dir, 'inside')
    }
    return kinds
  }, [git])
  const diffChange = changes.find((change) => change.path === diffPath)
  /** The graph fills the editor while the history is picked and no diff is. */
  const showsHistory = panel === 'history' && !diffChange
  const showsText = !diffChange && !showsHistory && active?.status === 'text'

  function patchTab(path: string, patch: Partial<Tab>) {
    setTabs((list) => {
      const tab = list.find((x) => x.path === path)
      // Typing reports the same dirty flag on every keystroke.
      if (!tab || Object.entries(patch).every(([key, value]) => tab[key as keyof Tab] === value)) return list
      return list.map((x) => (x === tab ? { ...tab, ...patch } : x))
    })
  }

  async function loadDir(dir: string) {
    try {
      const entries = await window.api.filesList(id, dir)
      setDirs((all) => ({ ...all, [dir]: entries }))
    } catch {
      // The directory is gone.
      setDirs(({ [dir]: _gone, ...rest }) => rest)
    }
  }

  function toggleDir(dir: string) {
    const next = new Set(expanded)
    if (!next.delete(dir)) {
      next.add(dir)
      void loadDir(dir)
    }
    setExpanded(next)
  }

  function createState(path: string, content: string, language: Extension): EditorState {
    return EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab, { key: 'Mod-s', run: () => (void latest.current.save(path), true) }]),
        // Files keep the line endings they came with.
        content.includes('\r\n') ? EditorState.lineSeparator.of('\r\n') : [],
        language,
        editorTheme,
        EditorView.updateListener.of((update) => {
          const buffer = buffers.current.get(path)
          if (!buffer) return
          buffer.state = update.state
          if (update.docChanged) patchTab(path, { dirty: !update.state.doc.eq(buffer.saved) })
        })
      ]
    })
  }

  async function openFile(path: string) {
    setDiffPath(null)
    setActivePath(path)
    setError(null)
    if (tabs.some((tab) => tab.path === path)) return
    const name = path.slice(path.lastIndexOf('/') + 1)
    setTabs((list) => [...list, { path, name, status: 'loading', dirty: false, stale: false }])
    try {
      const file = await window.api.fileRead(id, path)
      if (file.kind === 'binary') return patchTab(path, { status: 'binary' })
      if (file.kind === 'too_large') {
        return patchTab(path, { status: 'too_large', megabytes: (file.size / 1024 / 1024).toFixed(1) })
      }
      const language = await LanguageDescription.matchFilename(languages, name)
        ?.load()
        .catch(() => null)
      const state = createState(path, file.content, language ?? [])
      buffers.current.set(path, { state, saved: state.doc, mtimeMs: file.mtimeMs })
      patchTab(path, { status: 'text' })
    } catch {
      patchTab(path, { status: 'unreadable' })
    }
  }

  function selectTab(path: string) {
    setDiffPath(null)
    setActivePath(path)
  }

  async function save(path: string) {
    const buffer = buffers.current.get(path)
    if (!buffer) return
    const { doc } = buffer.state
    setError(null)
    try {
      const mtimeMs = await window.api.fileWrite(id, path, buffer.state.sliceDoc(), buffer.mtimeMs)
      if (mtimeMs === null) return
      buffer.saved = doc
      buffer.mtimeMs = mtimeMs
      // Typing may have gone on while the file was being written.
      patchTab(path, { dirty: !buffer.state.doc.eq(doc), stale: false })
    } catch (err) {
      setError(cleanError(err))
    }
  }

  /** Brings a buffer in line with the file, unless that would cost unsaved changes. */
  async function syncFromDisk(path: string, force = false) {
    const buffer = buffers.current.get(path)
    if (!buffer) return
    const file = await window.api.fileRead(id, path).catch(() => null)
    // A deleted file stays open: saving it writes it back.
    if (file?.kind !== 'text' || buffers.current.get(path) !== buffer) return
    if (!force && file.mtimeMs === buffer.mtimeMs) return

    const current = buffer.state
    if (file.content !== current.sliceDoc()) {
      if (!force && !current.doc.eq(buffer.saved)) return patchTab(path, { stale: true })
      const text = current.toText(file.content)
      const change = {
        changes: { from: 0, to: current.doc.length, insert: text },
        selection: { anchor: Math.min(current.selection.main.head, text.length) },
        // Undo must not bring back what the agent replaced.
        annotations: Transaction.addToHistory.of(false)
      }
      if (view.current?.state === current) view.current.dispatch(change)
      else buffer.state = current.update(change).state
    }
    buffer.saved = buffer.state.doc
    buffer.mtimeMs = file.mtimeMs
    patchTab(path, { dirty: false, stale: false })
  }

  function onDiskChange(paths: string[]) {
    const everything = paths.length === 0
    const parents = new Set(paths.map(parentOf))
    for (const dir of Object.keys(dirs)) if (everything || parents.has(dir)) void loadDir(dir)
    for (const path of buffers.current.keys()) if (everything || paths.includes(path)) void syncFromDisk(path)
  }

  async function closeTab(path: string) {
    const tab = tabs.find((x) => x.path === path)
    if (!tab) return
    if (tab.dirty && !(await window.api.confirmDiscard(tab.name))) return
    buffers.current.delete(path)
    const { tabs: list, activePath: current } = latest.current
    const index = list.findIndex((x) => x.path === path)
    const rest = list.filter((x) => x.path !== path)
    setTabs(rest)
    if (current === path) setActivePath((rest[index] ?? rest[index - 1])?.path ?? null)
  }

  /** Editor keymaps and IPC listeners outlive a render; they reach the current state through here. */
  const latest = useRef({ save, onDiskChange, tabs, activePath })
  latest.current = { save, onDiskChange, tabs, activePath }

  useEffect(() => {
    void loadDir('')
    void window.api.filesWatch(id)
    const off = window.api.onFilesChanged((featureId, paths) => {
      if (featureId === id) latest.current.onDiskChange(paths)
    })
    return () => {
      off()
      void window.api.filesUnwatch(id)
    }
  }, [id])

  useEffect(() => {
    const created = new EditorView({ parent: host.current! })
    view.current = created
    return () => {
      created.destroy()
      view.current = null
    }
  }, [])

  useEffect(() => {
    const buffer = activePath ? buffers.current.get(activePath) : undefined
    if (!buffer || !view.current || !showsText) return
    if (view.current.state !== buffer.state) view.current.setState(buffer.state)
    if (visible) view.current.focus()
  }, [activePath, showsText])

  // Nothing could be measured while the editor was hidden.
  useEffect(() => {
    if (visible) view.current?.requestMeasure()
  }, [visible])

  /** Tabs of a path, or of anything inside it when it is a folder. */
  const tabsUnder = (path: string) => latest.current.tabs.filter((x) => x.path === path || x.path.startsWith(`${path}/`))

  async function commitName(value: string) {
    const action = naming
    setNaming(null)
    const name = value.trim()
    if (!action || !name) return
    setError(null)
    try {
      if (action.kind === 'create') {
        const path = await window.api.fileCreate(id, action.dir, name, action.isDirectory)
        await loadDir(action.dir)
        if (!action.isDirectory) void openFile(path)
      } else {
        if (name === action.path.slice(action.path.lastIndexOf('/') + 1)) return
        // Open tabs would point at the old path: close them first, unless that costs unsaved changes.
        for (const tab of tabsUnder(action.path)) await closeTab(tab.path)
        if (tabsUnder(action.path).length) return
        await window.api.fileRename(id, action.path, name)
        await loadDir(parentOf(action.path))
      }
    } catch (err) {
      setError(cleanError(err))
    }
  }

  async function deleteEntry(path: string) {
    setError(null)
    try {
      if (!(await window.api.fileDelete(id, path))) return
      for (const tab of tabsUnder(path)) {
        buffers.current.delete(tab.path)
        setTabs((list) => list.filter((x) => x.path !== tab.path))
        if (latest.current.activePath === tab.path) setActivePath(null)
      }
      await loadDir(parentOf(path))
    } catch (err) {
      setError(cleanError(err))
    }
  }

  /** Right-click on a row, or on the empty part of the tree (the root). */
  async function entryMenu(e: React.MouseEvent, path: string, isDirectory: boolean) {
    e.stopPropagation()
    const action = await openContextMenu(e, { kind: 'entry', path, isDirectory })
    if (action === 'new-file' || action === 'new-folder') {
      if (path && !expanded.has(path)) toggleDir(path)
      setNaming({ kind: 'create', dir: path, isDirectory: action === 'new-folder' })
    } else if (action === 'rename-entry') setNaming({ kind: 'rename', path })
    else if (action === 'delete-entry') void deleteEntry(path)
  }

  /** The row where a name is typed; Enter keeps it, Escape or leaving the field drops it. */
  function renderNameRow(depth: number, isDirectory: boolean, initial: string) {
    return (
      <div className="tree-row tree-naming" style={{ paddingLeft: 10 + depth * 12 }}>
        <span className="tree-arrow" />
        <input
          className="tree-name-input"
          aria-label={isDirectory ? t.editor.nameFolder : t.editor.nameFile}
          defaultValue={initial}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => void commitName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              e.currentTarget.value = ''
              e.currentTarget.blur()
            }
            e.stopPropagation()
          }}
        />
      </div>
    )
  }

  function renderDir(dir: string, depth: number): ReactNode {
    const creating = naming?.kind === 'create' && naming.dir === dir ? naming : null
    const rows = dirs[dir]?.map((entry) => {
      if (naming?.kind === 'rename' && naming.path === entry.path) return <Fragment key={entry.path}>{renderNameRow(depth, entry.isDirectory, entry.name)}</Fragment>
      const open = entry.isDirectory && expanded.has(entry.path)
      return (
        <Fragment key={entry.path}>
          <button
            className={`tree-row${entry.path === activePath ? ' selected' : ''}`}
            style={{ paddingLeft: 10 + depth * 12 }}
            title={entry.path}
            aria-expanded={entry.isDirectory ? open : undefined}
            onClick={() => (entry.isDirectory ? toggleDir(entry.path) : void openFile(entry.path))}
            onContextMenu={(e) => void entryMenu(e, entry.path, entry.isDirectory)}
          >
            <span className="tree-arrow">{entry.isDirectory && <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />}</span>
            <span className={`tree-name${entry.isDirectory ? ' dir' : ''} ${changed.get(entry.path) ?? ''}`}>{entry.name}</span>
          </button>
          {open && renderDir(entry.path, depth + 1)}
        </Fragment>
      )
    })
    return (
      <>
        {creating && renderNameRow(depth, creating.isDirectory, '')}
        {rows}
      </>
    )
  }

  const notice: Record<Exclude<Tab['status'], 'text'>, string> = {
    loading: t.editor.loading,
    binary: t.editor.binary,
    too_large: t.editor.tooLarge(active?.megabytes ?? ''),
    unreadable: t.editor.unreadable
  }

  return (
    <section className="editor" hidden={!visible} style={size}>
      <nav className="editor-tree" aria-label={t.editor.files}>
        <div className="editor-tree-head" role="tablist">
          {(
            [
              ['changes', t.git.tabUncommitted, commitChanges.length],
              ['history', t.git.history, 0],
              ['files', t.git.tabFiles, 0],
              ['pr', t.git.tabPr, 0]
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              role="tab"
              aria-selected={panel === id}
              className={`tree-tab${panel === id ? ' selected' : ''}`}
              onClick={() => {
                onPanel(id)
                if (id === 'history') setDiffPath(null)
              }}
            >
              {label} {count > 0 && <span className="num">{count}</span>}
            </button>
          ))}
        </div>
        {panel === 'files' ? (
          <div className="editor-tree-list" onContextMenu={(e) => void entryMenu(e, '', true)}>
            <div className="tree-tools">
              <button
                className="tree-tool"
                title={t.editor.newFile}
                aria-label={t.editor.newFile}
                onClick={() => setNaming({ kind: 'create', dir: '', isDirectory: false })}
              >
                <Icon name="plus" size={12} />
              </button>
              <button
                className="tree-tool"
                title={t.editor.newFolder}
                aria-label={t.editor.newFolder}
                onClick={() => setNaming({ kind: 'create', dir: '', isDirectory: true })}
              >
                <Icon name="folder-plus" size={12} />
              </button>
            </div>
            {renderDir('', 0)}
          </div>
        ) : panel === 'pr' ? (
          <div className="editor-tree-list pr-panel">
            <p className="pr-branch">
              <Icon name="branch" size={13} /> {git?.branch ?? feature.branch}
              {git && git.ahead > 0 && <span className="num">↑{git.ahead}</span>}
              {git && git.behind > 0 && <span className="num">↓{git.behind}</span>}
            </p>
            {!feature.prUrl && <p className="tree-empty">{t.git.noPr}</p>}
            <PullRequestStatusCard feature={feature} version={git} />
            <div className="pr-actions">
              <GitActions feature={feature} git={git} variant="sync" />
            </div>
          </div>
        ) : (
          <div className="editor-tree-list">
            <div className="filters" role="group" aria-label={t.git.changes}>
              {(['commit', 'turn'] as const).map((mode) => (
                <button
                  key={mode}
                  className={`filter${changesMode === mode ? ' selected' : ''}`}
                  aria-pressed={changesMode === mode}
                  title={mode === 'turn' ? t.git.lastTurnHint : undefined}
                  onClick={() => {
                    setChangesMode(mode)
                    setDiffPath(null)
                  }}
                >
                  {mode === 'turn' ? t.git.lastTurn : t.git.sinceCommit}
                </button>
              ))}
            </div>
            {!changes.length && (
              <p className="tree-empty">
                {changesMode === 'commit' ? t.git.noChanges : turn === null ? t.git.noTurnSnapshot : turn ? t.git.noTurnChanges : t.editor.loading}
              </p>
            )}
            {changes.map((change) => (
              <button
                key={change.path}
                className={`tree-row${change.path === diffPath ? ' selected' : ''}`}
                title={`${t.git.kind[change.kind]} · ${change.path}`}
                onClick={() => setDiffPath(change.path)}
              >
                <span className={`change-mark ${change.kind}`}>{CHANGE_MARK[change.kind]}</span>
                <span className={`tree-name ${change.kind}`}>{change.path.slice(change.path.lastIndexOf('/') + 1)}</span>
                <span className="change-dir">{parentOf(change.path)}</span>
              </button>
            ))}
          </div>
        )}
        {panel === 'changes' && (
          <footer className="editor-tree-foot">
            <button disabled={!changes.length} onClick={() => setDiffPath(changes[0]?.path ?? null)}>
              {t.git.viewDiff}
            </button>
            <GitActions feature={feature} git={git} variant="commit" />
          </footer>
        )}
      </nav>

      <div className="editor-main">
        <header className="editor-tabs">
          <div className="editor-tablist" role="tablist">
            {tabs.map((tab) => (
              <div
                key={tab.path}
                role="tab"
                tabIndex={0}
                aria-selected={tab === active && !diffChange}
                className={`editor-tab${tab === active && !diffChange ? ' selected' : ''}`}
                title={tab.path}
                onClick={() => selectTab(tab.path)}
                onKeyDown={(e) => e.key === 'Enter' && selectTab(tab.path)}
                onAuxClick={(e) => e.button === 1 && void closeTab(tab.path)}
              >
                <span className="editor-tab-name">{tab.name}</span>
                {tab.dirty && <span className="editor-tab-dirty" title={t.editor.unsaved} />}
                <button
                  className="editor-tab-close"
                  title={t.editor.close}
                  aria-label={t.editor.close}
                  onClick={(e) => {
                    e.stopPropagation()
                    void closeTab(tab.path)
                  }}
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          </div>
          <button className="editor-save" disabled={!active?.dirty} onClick={() => active && void save(active.path)}>
            {t.editor.save}
          </button>
        </header>

        {active?.stale && (
          <p className="editor-notice">
            {t.editor.changedOnDisk}
            <button onClick={() => void syncFromDisk(active.path, true)}>{t.editor.reload}</button>
          </p>
        )}
        {error && <p className="editor-notice error">{error}</p>}

        {diffChange && <DiffView id={id} path={diffChange.path} kind={diffChange.kind} revision={git} baseRef={changesMode === 'turn' ? turn?.base : undefined} />}
        {showsHistory && visible && <HistoryGraph id={id} git={git} onShowChanges={() => onPanel('changes')} />}
        <div className="editor-code" ref={host} hidden={!showsText} />
        {!showsText && !diffChange && !showsHistory && <p className="editor-empty">{active ? notice[active.status as keyof typeof notice] : t.editor.pickFile}</p>}
      </div>
    </section>
  )
}
