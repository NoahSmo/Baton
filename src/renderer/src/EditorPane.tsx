import { indentWithTab } from '@codemirror/commands'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { EditorState, Transaction, type Extension, type Text } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Feature, FileEntry, GitChangeKind, GitStatus } from '../../shared/types'
import { DiffView } from './DiffView'
import { editorTheme } from './editorTheme'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'

interface Props {
  feature: Feature
  /** A hidden editor stays mounted, so open files and unsaved changes survive. */
  visible: boolean
  width: number
  /** Status of the worktree; null while unknown or hidden. */
  git: GitStatus | null
  /** Which list the side column shows. */
  panel: EditorPanel
  onPanel(panel: EditorPanel): void
}

export type EditorPanel = 'files' | 'changes'

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
export function EditorPane({ feature, visible, width, git, panel, onPanel }: Props) {
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
  const buffers = useRef(new Map<string, Buffer>())
  const view = useRef<EditorView | null>(null)
  const host = useRef<HTMLDivElement>(null)

  const active = tabs.find((tab) => tab.path === activePath) ?? null
  const changes = git?.changes ?? []

  /** Changed files by path, and the folders leading to them. */
  const changed = useMemo(() => {
    const kinds = new Map<string, GitChangeKind | 'inside'>()
    for (const change of changes) {
      kinds.set(change.path, change.kind)
      for (let dir = parentOf(change.path); dir && !kinds.has(dir); dir = parentOf(dir)) kinds.set(dir, 'inside')
    }
    return kinds
  }, [git])
  const diffChange = changes.find((change) => change.path === diffPath)
  const showsText = !diffChange && active?.status === 'text'

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

  function renderDir(dir: string, depth: number): ReactNode {
    return dirs[dir]?.map((entry) => {
      const open = entry.isDirectory && expanded.has(entry.path)
      return (
        <Fragment key={entry.path}>
          <button
            className={`tree-row${entry.path === activePath ? ' selected' : ''}`}
            style={{ paddingLeft: 10 + depth * 12 }}
            title={entry.path}
            aria-expanded={entry.isDirectory ? open : undefined}
            onClick={() => (entry.isDirectory ? toggleDir(entry.path) : void openFile(entry.path))}
          >
            <span className="tree-arrow">{entry.isDirectory ? (open ? '▾' : '▸') : ''}</span>
            <span className={`tree-name${entry.isDirectory ? ' dir' : ''} ${changed.get(entry.path) ?? ''}`}>{entry.name}</span>
          </button>
          {open && renderDir(entry.path, depth + 1)}
        </Fragment>
      )
    })
  }

  const notice: Record<Exclude<Tab['status'], 'text'>, string> = {
    loading: t.editor.loading,
    binary: t.editor.binary,
    too_large: t.editor.tooLarge(active?.megabytes ?? ''),
    unreadable: t.editor.unreadable
  }

  return (
    <section className="editor" hidden={!visible} style={{ width }}>
      <nav className="editor-tree" aria-label={t.editor.files}>
        <div className="editor-tree-head" role="tablist">
          <button
            role="tab"
            aria-selected={panel === 'files'}
            className={`sidebar-title tree-tab${panel === 'files' ? ' selected' : ''}`}
            onClick={() => onPanel('files')}
          >
            {t.editor.files}
          </button>
          <button
            role="tab"
            aria-selected={panel === 'changes'}
            className={`sidebar-title tree-tab${panel === 'changes' ? ' selected' : ''}`}
            onClick={() => onPanel('changes')}
          >
            {t.git.changes} {changes.length > 0 && <span className="num">{changes.length}</span>}
          </button>
        </div>
        {panel === 'files' ? (
          <div className="editor-tree-list">{renderDir('', 0)}</div>
        ) : (
          <div className="editor-tree-list">
            {!changes.length && <p className="tree-empty">{t.git.noChanges}</p>}
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
                  ×
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

        {diffChange && <DiffView id={id} path={diffChange.path} kind={diffChange.kind} revision={git} />}
        <div className="editor-code" ref={host} hidden={!showsText} />
        {!showsText && !diffChange && <p className="editor-empty">{active ? notice[active.status as keyof typeof notice] : t.editor.pickFile}</p>}
      </div>
    </section>
  )
}
