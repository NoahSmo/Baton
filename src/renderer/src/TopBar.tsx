import type { Feature, MenuAction, Project } from '../../shared/types'
import { openContextMenu } from './contextMenu'
import { useT } from './i18n'
import { Icon } from './ui/Icon'

interface Props {
  projects: Project[]
  features: Feature[]
  activeId: string | null
  /** The Linear tab only exists once an account is connected. */
  linearAvailable: boolean
  linearActive: boolean
  onSelectLinear(): void
  onSelect(id: string): void
  onNew(): void
  onOpenSettings(): void
  /** A choice from a tab's context menu that needs a dialog. */
  onMenuAction(project: Project, action: MenuAction): void
}

export function TopBar({
  projects,
  features,
  activeId,
  linearAvailable,
  linearActive,
  onSelectLinear,
  onSelect,
  onNew,
  onOpenSettings,
  onMenuAction
}: Props) {
  const t = useT()
  return (
    <header className="topbar">
      <nav className="tabs">
        {linearAvailable && (
          <>
            <button className={`tab pinned${linearActive ? ' active' : ''}`} onClick={onSelectLinear}>
              <span className="tab-name">{t.linearView.tab}</span>
            </button>
            <span className="tab-divider" />
          </>
        )}
        {projects.map((p) => {
          const waiting = features.filter((f) => f.projectId === p.id && f.status === 'waiting').length
          return (
            <button
              key={p.id}
              className={`tab${!linearActive && p.id === activeId ? ' active' : ''}`}
              style={{ '--tab-color': p.color } as React.CSSProperties}
              onClick={() => onSelect(p.id)}
              onContextMenu={async (e) => {
                const action = await openContextMenu(e, { kind: 'project', projectId: p.id })
                if (action) onMenuAction(p, action)
              }}
            >
              <span className="swatch" />
              <span className="tab-name">{p.name}</span>
              {waiting > 0 && (
                <span className="tab-badge num" title={t.topbar.waitingBadge}>
                  {waiting}
                </span>
              )}
            </button>
          )
        })}
        <button className="tab-add" onClick={onNew} title={t.topbar.newProject}>
          <Icon name="plus" />
        </button>
      </nav>
      <button className="topbar-settings" title={t.update.settingsOpen} aria-label={t.update.settingsOpen} onClick={onOpenSettings}>
        ⚙
      </button>
    </header>
  )
}
