import { useState } from 'react'
import { issuesInColumn, priorityColumns, statesOfType, statusColumns, type BoardGrouping, type KanbanColumn, type KanbanLane } from '../../shared/kanban'
import type { Feature, LinearIssue, LinearState, Project } from '../../shared/types'
import { openContextMenu } from './contextMenu'
import { useT } from './i18n'
import { STATE_TYPE_DOT } from './IssueStateFilter'

interface Props {
  issues: LinearIssue[]
  teamStates: Record<string, LinearState[]>
  grouping: BoardGrouping
  /** One row per Linear project under shared columns; null lays the columns out alone. */
  lanes: KanbanLane[] | null
  /** Keys of the lanes folded down to their header. */
  collapsed: string[]
  onToggleLane(key: string): void
  projects: Project[]
  features: Feature[]
  /** Repositories the issue's Linear project points at. */
  reposFor(linearProjectId: string | null): Project[]
  onMove(issue: LinearIssue, column: KanbanColumn): void
  /** The user picked an exact status for the issue among those of its category. */
  onSetState(issue: LinearIssue, stateId: string): void
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

function ColumnHead({ col, count }: { col: KanbanColumn; count: number }) {
  const t = useT()
  return (
    <header className="kanban-column-head">
      {col.priority !== undefined ? (
        <PriorityIcon priority={col.priority} />
      ) : (
        <span className={`dot ${STATE_TYPE_DOT[col.type ?? ''] ?? ''} still`} />
      )}
      <span className="kanban-column-name">{col.priority !== undefined ? t.linearView.priorities[col.priority] : (t.linearView.stateTypes[col.type ?? ''] ?? col.key)}</span>
      <span className="num">{count}</span>
    </header>
  )
}

/** Issues laid out as columns of cards; dropping a card on a column changes its status or priority in Linear. */
export function KanbanBoard({ issues, teamStates, grouping, lanes, collapsed, onToggleLane, projects, features, reposFor, onMove, onSetState, onStart, onOpenFeature }: Props) {
  const t = useT()
  const [dragged, setDragged] = useState<LinearIssue | null>(null)
  /** The cell under the dragged card: the column key, prefixed by the lane key when there are lanes. */
  const [over, setOver] = useState<string | null>(null)

  // Columns come from every issue so all lanes line up under the same ones.
  const columns = grouping === 'status' ? statusColumns(issues) : priorityColumns(issues)

  /** The exact status of a card, switchable among the ones of its category when the team has several. */
  function renderStatus(issue: LinearIssue) {
    const options = statesOfType(teamStates[issue.teamId] ?? [], issue.stateType)
    if (options.length < 2) return <span className="kanban-state">{issue.stateName}</span>
    return (
      <select
        className="kanban-state-select"
        value={issue.stateId}
        draggable={false}
        aria-label={issue.stateName}
        onChange={(e) => onSetState(issue, e.target.value)}
      >
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    )
  }

  function renderCard(issue: LinearIssue) {
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
          {grouping === 'priority' ? (
            renderStatus(issue)
          ) : (
            <span className="kanban-priority" title={t.linearView.priorities[issue.priority]}>
              <PriorityIcon priority={issue.priority} />
              {issue.priority !== 0 && t.linearView.priorities[issue.priority]}
            </span>
          )}
        </div>
        {grouping === 'status' && statesOfType(teamStates[issue.teamId] ?? [], issue.stateType).length > 1 && renderStatus(issue)}
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
  }

  /** A column, or the cell of a lane under it; a drop there moves the card to the column. */
  function renderCell(col: KanbanColumn, cards: LinearIssue[], lane?: KanbanLane) {
    const key = lane ? `${lane.key}:${col.key}` : col.key
    return (
      <section
        key={key}
        className={`kanban-column${over === key ? ' over' : ''}`}
        onDragOver={(e) => {
          if (!dragged) return
          e.preventDefault()
          setOver(key)
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
        {!lane && <ColumnHead col={col} count={cards.length} />}
        <div className="kanban-cards">{cards.map(renderCard)}</div>
      </section>
    )
  }

  if (!lanes) return <div className="kanban">{columns.map((col) => renderCell(col, col.issues))}</div>

  return (
    <div className="kanban kanban-lanes">
      <div className="kanban-lanes-inner">
        <div className="kanban-lanes-heads">
          {columns.map((col) => (
            <ColumnHead key={col.key} col={col} count={col.issues.length} />
          ))}
        </div>
        {lanes.map((lane) => {
          const folded = collapsed.includes(lane.key)
          return (
            <section key={lane.key} className={`kanban-lane${folded ? ' collapsed' : ''}`}>
              <button className="kanban-lane-head" aria-expanded={!folded} onClick={() => onToggleLane(lane.key)}>
                <span className="kanban-lane-chevron" aria-hidden>
                  ▾
                </span>
                <span className="kanban-lane-name">{lane.name}</span>
                <span className="num">{lane.issues.length}</span>
              </button>
              {!folded && <div className="kanban-lane-row">{columns.map((col) => renderCell(col, issuesInColumn(lane, col), lane))}</div>}
            </section>
          )
        })}
      </div>
    </div>
  )
}
