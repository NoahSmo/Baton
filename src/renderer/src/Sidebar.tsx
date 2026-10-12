import { useState } from 'react'
import type { Feature, FeatureStatus, Project } from '../../shared/types'
import { openContextMenu } from './contextMenu'
import { useT } from './i18n'

/** Order of the filter chips: what needs the user first. */
const STATUS_ORDER: FeatureStatus[] = ['waiting', 'working', 'done', 'error', 'limited', 'idle']

/** "claude-opus-5-5" reads better as "opus-5-5" in a narrow column. */
function shortModel(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

interface Props {
  project: Project
  features: Feature[]
  selectedId: string | null
  onSelect(feature: Feature): void
  onNew(): void
  onEditProject(): void
}

export function Sidebar({ project, features, selectedId, onSelect, onNew, onEditProject }: Props) {
  const t = useT()
  const [filter, setFilter] = useState<FeatureStatus[]>([])
  const [renamingId, setRenamingId] = useState<string | null>(null)

  async function openMenu(e: React.MouseEvent, feature: Feature) {
    const action = await openContextMenu(e, { kind: 'feature', featureId: feature.id })
    if (action === 'rename-feature') setRenamingId(feature.id)
  }

  function commitRename(feature: Feature, title: string) {
    setRenamingId(null)
    if (title.trim() && title.trim() !== feature.title) void window.api.renameFeature(feature.id, title)
  }

  const counts = new Map<FeatureStatus, number>()
  for (const f of features) counts.set(f.status, (counts.get(f.status) ?? 0) + 1)
  const present = STATUS_ORDER.filter((s) => counts.has(s))
  // A filtered status can empty out (features change state, tabs change): ignore it rather than show nothing.
  const active = filter.filter((s) => counts.has(s))
  const shown = active.length ? features.filter((f) => active.includes(f.status)) : features

  const toggle = (status: FeatureStatus) =>
    setFilter(active.includes(status) ? active.filter((s) => s !== status) : [...active, status])

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="sidebar-title">
          {t.sidebar.features} <span className="num">{features.length}</span>
        </span>
        <button onClick={onNew}>
          <span className="plus">+</span> {t.sidebar.newFeature}
        </button>
      </div>

      {present.length > 1 && (
        <div className="filters" role="group" aria-label={t.sidebar.filterByStatus}>
          <button className={`filter${active.length ? '' : ' selected'}`} onClick={() => setFilter([])}>
            {t.sidebar.all}
          </button>
          {present.map((status) => (
            <button
              key={status}
              className={`filter${active.includes(status) ? ' selected' : ''}`}
              aria-pressed={active.includes(status)}
              title={t.status[status]}
              onClick={() => toggle(status)}
            >
              <span className={`dot ${status} still`} />
              <span className="num">{counts.get(status)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="sidebar-list">
        {shown.map((f) => (
          <div
            key={f.id}
            role="button"
            tabIndex={0}
            className={`feature-row${f.id === selectedId ? ' selected' : ''}`}
            onClick={() => onSelect(f)}
            onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onSelect(f)}
            onDoubleClick={() => setRenamingId(f.id)}
            onContextMenu={(e) => void openMenu(e, f)}
          >
            <span className="feature-row-top">
              <span className={`dot ${f.status}`} />
              {renamingId === f.id ? (
                <input
                  className="feature-row-rename"
                  autoFocus
                  defaultValue={f.title}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onBlur={(e) => commitRename(f, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(f, e.currentTarget.value)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                />
              ) : (
                <span className="feature-row-title">{f.title}</span>
              )}
              <span className="feature-row-status">{t.status[f.status]}</span>
            </span>
            <span className="feature-row-sub">
              {f.linear && <span className="feature-row-issue">{f.linear.identifier}</span>}
              {f.model && <span>{shortModel(f.model)}</span>}
              <span className="num">${f.costUsd.toFixed(2)}</span>
            </span>
          </div>
        ))}
        {!features.length && <p className="sidebar-empty">{t.sidebar.none}</p>}
      </div>

      <div className="sidebar-project">
        <div className="sidebar-project-head">
          <span className="sidebar-title">{t.sidebar.project}</span>
          <button className="icon" onClick={onEditProject} title={t.sidebar.projectSettings}>
            ⚙
          </button>
        </div>
        <p className="sidebar-path" title={project.path}>
          {project.path.replace(/^\/Users\/[^/]+/, '~')}
        </p>
        <p className="sidebar-linear">
          {project.linearProject ? (
            <>
              <span className="dot done" /> Linear · {project.linearProject.name}
            </>
          ) : (
            <button className="link" onClick={onEditProject}>
              {t.sidebar.linkLinear}
            </button>
          )}
        </p>
      </div>
    </aside>
  )
}
