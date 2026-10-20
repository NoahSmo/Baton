import { useState } from 'react'
import { priorityColumns, statusColumns, type BoardGrouping, type KanbanColumn } from '../../shared/kanban'
import type { Feature, LinearIssue, LinearState, Project } from '../../shared/types'
import { openContextMenu } from './contextMenu'
import { useT } from './i18n'
import { STATE_TYPE_DOT } from './IssueStateFilter'

interface Props {
  issues: LinearIssue[]
  teamStates: Record<string, LinearState[]>
  grouping: BoardGrouping
  projects: Project[]
  features: Feature[]
  /** Repositories the issue's Linear project points at. */
  reposFor(linearProjectId: string | null): Project[]
  onMove(issue: LinearIssue, column: KanbanColumn): void
  onStart(issue: LinearIssue, repos: Project[]): void
  onOpenFeature(feature: Feature): void
}

/** Bars of the priority glyph that are lit, per Linear priority. */
const PRIORITY_BARS: Record<number, number> = { 1: 4, 2: 3, 3: 2, 4: 1 }

function PriorityIcon({ priority }: { priority: number }) {
  const lit = PRIORITY_BARS[priority] ?? 0
  return (
    <span className={`priority-icon p${priority}`} aria-hidden>
      {[1, 2, 3, 4].map((bar) => (
        <i key={bar} className={bar <= lit ? 'lit' : ''} style={{ height: 3 + bar * 2 }} />
      ))}
    </span>
  )
}

/** Issues laid out as columns of cards; dropping a card on a column changes its status or priority in Linear. */
export function KanbanBoard({ issues, teamStates, grouping, projects, features, reposFor, onMove, onStart, onOpenFeature }: Props) {
  const t = useT()
  const [dragged, setDragged] = useState<LinearIssue | null>(null)
  const [over, setOver] = useState<string | null>(null)

  const columns = grouping === 'status' ? statusColumns(issues, teamStates) : priorityColumns(issues)

  return (
    <div className="kanban">
      {columns.map((col) => (
        <section
          key={col.key}
          className={`kanban-column${over === col.key ? ' over' : ''}`}
          onDragOver={(e) => {
            if (!dragged) return
            e.preventDefault()
            setOver(col.key)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setOver(null)
            if (dragged) onMove(dragged, col)
            setDragged(null)
          }}
        >
          <header className="kanban-column-head">
            {col.priority !== undefined ? (
              <PriorityIcon priority={col.priority} />
            ) : (
              <span className={`dot ${STATE_TYPE_DOT[col.type ?? ''] ?? ''} still`} />
            )}
            <span className="kanban-column-name">{col.priority !== undefined ? t.linearView.priorities[col.priority] : col.key}</span>
            <span className="num">{col.issues.length}</span>
          </header>
          <div className="kanban-cards">
            {col.issues.map((issue) => {
              const feature = features.find((f) => f.linear?.issueId === issue.id)
              const repos = reposFor(issue.linearProjectId)
              return (
                <article
                  key={issue.id}
                  className={`kanban-card${dragged?.id === issue.id ? ' dragging' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    setDragged(issue)
                  }}
                  onDragEnd={() => {
                    setDragged(null)
                    setOver(null)
                  }}
                  onContextMenu={(e) => {
                    const { identifier, url, branchName } = issue
                    void openContextMenu(e, { kind: 'issue', identifier, url, branchName })
                  }}
                >
                  <div className="kanban-card-top">
                    <a className="issue-id" href={issue.url} target="_blank" rel="noreferrer" draggable={false}>
                      {issue.identifier}
                    </a>
                    {grouping === 'status' && (
                      <span className="kanban-priority" title={t.linearView.priorities[issue.priority]}>
                        <PriorityIcon priority={issue.priority} />
                        {issue.priority !== 0 && t.linearView.priorities[issue.priority]}
                      </span>
                    )}
                    {grouping === 'priority' && <span className="kanban-state">{issue.stateName}</span>}
                  </div>
                  <p className="kanban-card-title">{issue.title}</p>
                  <div className="kanban-card-foot">
                    <span className="linear-assignee">{issue.assigneeName ?? t.linearView.unassigned}</span>
                    {feature ? (
                      <button className="linear-action" onClick={() => onOpenFeature(feature)}>
                        {t.linearView.openFeature}
                      </button>
                    ) : (
                      <button
                        className="linear-action primary"
                        disabled={!projects.length}
                        title={projects.length ? repos.map((r) => r.name).join(', ') || undefined : t.linearView.needProject}
                        onClick={() => onStart(issue, repos)}
                      >
                        {t.linearView.startFeature}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
