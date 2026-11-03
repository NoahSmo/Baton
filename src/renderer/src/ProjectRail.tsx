import type { Feature, MenuAction, Project } from '../../shared/types'
import { openContextMenu } from './contextMenu'
import { useT } from './i18n'
import { Icon } from './ui/Icon'

interface Props {
  projects: Project[]
  features: Feature[]
  activeId: string | null
  onSelect(id: string): void
  onNew(): void
  onOpenUsage(): void
  onOpenSettings(): void
  /** A choice from an avatar's context menu that needs a dialog. */
  onMenuAction(project: Project, action: MenuAction): void
}

/** Two letters standing for a project: "studio-web" → "SW", "demo" → "DE". */
export function initials(name: string): string {
  const words = name.split(/[\s\-_./]+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}

/** Vertical strip of project avatars, with the app's global actions at the bottom. */
export function ProjectRail({ projects, features, activeId, onSelect, onNew, onOpenUsage, onOpenSettings, onMenuAction }: Props) {
  const t = useT()
  return (
    <nav className="rail" aria-label={t.rail.projects}>
      <div className="rail-list">
        {projects.map((p) => {
          const own = features.filter((f) => f.projectId === p.id)
          const waiting = own.filter((f) => f.status === 'waiting').length
          const working = own.some((f) => f.status === 'working')
          return (
            <button
              key={p.id}
              className={`rail-item${p.id === activeId ? ' active' : ''}`}
              style={{ '--tab-color': p.color } as React.CSSProperties}
              title={p.name}
              onClick={() => onSelect(p.id)}
              onContextMenu={async (e) => {
                const action = await openContextMenu(e, { kind: 'project', projectId: p.id })
                if (action) onMenuAction(p, action)
              }}
            >
              <span className="rail-avatar">{initials(p.name)}</span>
              <span className="rail-name">{p.name}</span>
              {waiting > 0 && (
                <span className="rail-badge num" title={t.topbar.waitingBadge}>
                  {waiting}
                </span>
              )}
              {working && <span className="dot working rail-dot" />}
            </button>
          )
        })}
        <button className="rail-add" onClick={onNew} title={t.topbar.newProject} aria-label={t.topbar.newProject}>
          <Icon name="plus" size={16} />
        </button>
      </div>
      <div className="rail-foot">
        <button className="rail-tool" onClick={onOpenUsage} title={t.usage.title} aria-label={t.usage.title}>
          <Icon name="chart" size={16} />
        </button>
        <button className="rail-tool" onClick={onOpenSettings} title={t.update.settingsOpen} aria-label={t.update.settingsOpen}>
          <Icon name="settings" size={16} />
        </button>
      </div>
    </nav>
  )
}
