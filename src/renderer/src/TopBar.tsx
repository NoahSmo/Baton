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
}

export function TopBar({ project, onSearch, searchShortcut, editor }: Props) {
  const t = useT()
  return (
    <header className="topbar">
      <div className="topbar-project">
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
            <Icon name="code" size={14} /> {t.topbar.editor}
          </button>
        )}
      </div>
    </header>
  )
}
