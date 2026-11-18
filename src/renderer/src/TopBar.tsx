import type { Project } from '../../shared/types'
import { useT } from './i18n'
import { Icon } from './ui/Icon'

interface Props {
  project: Project | null
  /** Opens the command palette. */
  onSearch(): void
  searchShortcut: string
  /** Absent when there is no agent to show an editor for. */
  editor?: { open: boolean; toggle(): void }
  /** On a small window the projects and agents slide in from a drawer; absent when they are always shown. */
  nav?: { open: boolean; toggle(): void; waiting: number }
}

export function TopBar({ project, onSearch, searchShortcut, editor, nav }: Props) {
  const t = useT()
  return (
    <header className="topbar">
      <div className="topbar-project">
        {nav && (
          <button
            className={`topbar-menu${nav.open ? ' toggled' : ''}`}
            aria-label={t.topbar.menu}
            title={t.topbar.menu}
            aria-expanded={nav.open}
            onClick={nav.toggle}
          >
            <Icon name="menu" size={16} />
            {nav.waiting > 0 && <span className="topbar-menu-badge num">{nav.waiting}</span>}
          </button>
        )}
        {project && (
          <span className="topbar-name">{project.name}</span>
        )}
      </div>
      <button className="topbar-search" onClick={onSearch} aria-label={t.topbar.search}>
        <Icon name="search" size={13} />
        <span>{t.topbar.search}</span>
        <kbd>{searchShortcut}</kbd>
      </button>
      <div className="topbar-actions">
        {editor && (
          <button className={`topbar-editor${editor.open ? ' toggled' : ''}`} aria-pressed={editor.open} onClick={editor.toggle}>
            <Icon name="code" size={14} /> <span className="topbar-editor-label">{t.topbar.editor}</span>
          </button>
        )}
      </div>
    </header>
  )
}
