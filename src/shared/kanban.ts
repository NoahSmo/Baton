import type { LinearIssue, LinearState } from './types'

/** How the board splits issues into columns. */
export type BoardGrouping = 'status' | 'priority'
export const BOARD_GROUPINGS: BoardGrouping[] = ['status', 'priority']

export interface KanbanColumn {
  /** Status name, or the priority number as text. */
  key: string
  /** Linear workflow category for a status column. */
  type?: string
  priority?: number
  issues: LinearIssue[]
}

const STATE_TYPE_ORDER = ['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled']

/** Linear priorities from most to least pressing; 0 ("none") sorts last, unlike its numeric value. */
export const PRIORITY_ORDER = [1, 2, 3, 4, 0]

const priorityRank = (priority: number) => {
  const rank = PRIORITY_ORDER.indexOf(priority)
  return rank === -1 ? PRIORITY_ORDER.length : rank
}

/** Most pressing first; the original order (most recently updated) breaks ties. */
export function sortByPriority(issues: LinearIssue[]): LinearIssue[] {
  return [...issues].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
}

/**
 * One column per workflow status, named like the statuses of the teams involved, in the order work moves.
 * Statuses of different teams that share a name share a column. Open statuses with no issue still get a column.
 */
export function statusColumns(issues: LinearIssue[], teamStates: Record<string, LinearState[]>): KanbanColumn[] {
  const columns = new Map<string, KanbanColumn & { position: number }>()
  const column = (key: string, type: string, position: number) => {
    let col = columns.get(key)
    if (!col) columns.set(key, (col = { key, type, position, issues: [] }))
    col.position = Math.min(col.position, position)
    return col
  }
  const teams = new Set(issues.map((i) => i.teamId))
  for (const teamId of teams) {
    for (const s of teamStates[teamId] ?? []) {
      if (s.type !== 'completed' && s.type !== 'canceled') column(s.name, s.type, s.position)
    }
  }
  for (const issue of issues) column(issue.stateName, issue.stateType, Infinity).issues.push(issue)
  return [...columns.values()]
    .sort(
      (a, b) =>
        STATE_TYPE_ORDER.indexOf(a.type ?? '') - STATE_TYPE_ORDER.indexOf(b.type ?? '') ||
        a.position - b.position ||
        a.key.localeCompare(b.key)
    )
    .map(({ position: _position, ...col }) => ({ ...col, issues: sortByPriority(col.issues) }))
}

/** One column per priority, all five shown so an issue can be dropped on any of them. */
export function priorityColumns(issues: LinearIssue[]): KanbanColumn[] {
  return PRIORITY_ORDER.map((priority) => ({
    key: String(priority),
    priority,
    issues: issues.filter((i) => priorityRank(i.priority) === priorityRank(priority))
  }))
}

/** The state of a team a card dropped on a status column moves to: same name, else same category. */
export function stateForColumn(states: LinearState[], column: Pick<KanbanColumn, 'key' | 'type'>): LinearState | undefined {
  return (
    states.find((s) => s.name === column.key) ??
    states.filter((s) => s.type === column.type).sort((a, b) => a.position - b.position)[0]
  )
}
