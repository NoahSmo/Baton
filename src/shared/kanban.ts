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

/** One row of the board: the issues of a Linear project, laid out under the same columns as the other rows. */
export interface KanbanLane {
  /** The Linear project id, or `none` for issues that belong to no project. */
  key: string
  name: string
  issues: LinearIssue[]
}

/** What the rows of the board are made of. */
export type LaneAxis = 'none' | 'project' | 'assignee'
export const LANE_AXES: LaneAxis[] = ['none', 'project', 'assignee']

export const NO_PROJECT_LANE = 'none'

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

/** Workflow categories shown as columns, in the order work moves. Canceled issues have no column. */
export const STATUS_COLUMN_TYPES = ['triage', 'backlog', 'unstarted', 'started', 'completed']

/**
 * One column per Linear workflow category, whatever the statuses of the teams are called.
 * Backlog, started and completed always show so a card can be dropped on them; triage only when an issue is in it.
 */
export function statusColumns(issues: LinearIssue[]): KanbanColumn[] {
  return STATUS_COLUMN_TYPES.map((type) => ({
    key: type,
    type,
    issues: sortByPriority(issues.filter((i) => i.stateType === type))
  })).filter((col) => col.type !== 'triage' || col.issues.length)
}

/** One column per priority, all five shown so an issue can be dropped on any of them. */
export function priorityColumns(issues: LinearIssue[]): KanbanColumn[] {
  return PRIORITY_ORDER.map((priority) => ({
    key: String(priority),
    priority,
    issues: issues.filter((i) => priorityRank(i.priority) === priorityRank(priority))
  }))
}

/** One lane per Linear project, by name, with the issues of no project last. */
export function groupByProject(issues: LinearIssue[], projectName: (linearProjectId: string) => string | undefined, noProjectName: string): KanbanLane[] {
  const lanes = new Map<string, KanbanLane>()
  for (const issue of issues) {
    const key = issue.linearProjectId ?? NO_PROJECT_LANE
    let lane = lanes.get(key)
    if (!lane) {
      const name = issue.linearProjectId ? (projectName(issue.linearProjectId) ?? issue.linearProjectId) : noProjectName
      lanes.set(key, (lane = { key, name, issues: [] }))
    }
    lane.issues.push(issue)
  }
  const rank = (lane: KanbanLane) => Number(lane.key === NO_PROJECT_LANE)
  return [...lanes.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

/** One lane per assignee, by name, with the unassigned issues last. */
export function groupByAssignee(issues: LinearIssue[], unassignedName: string): KanbanLane[] {
  const lanes = new Map<string, KanbanLane>()
  for (const issue of issues) {
    const key = issue.assigneeName ?? NO_PROJECT_LANE
    let lane = lanes.get(key)
    if (!lane) lanes.set(key, (lane = { key, name: issue.assigneeName ?? unassignedName, issues: [] }))
    lane.issues.push(issue)
  }
  const rank = (lane: KanbanLane) => Number(lane.key === NO_PROJECT_LANE)
  return [...lanes.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

/** The issues of a lane that belong in a column. */
export function issuesInColumn(lane: KanbanLane, column: KanbanColumn): LinearIssue[] {
  const inColumn = new Set(column.issues.map((i) => i.id))
  return lane.issues.filter((i) => inColumn.has(i.id))
}

/** The statuses of a team in one workflow category, in the order the team set them. */
export function statesOfType(states: LinearState[], type: string): LinearState[] {
  return states.filter((s) => s.type === type).sort((a, b) => a.position - b.position)
}

/** The status of a team a card dropped on a column takes: the first of the column's category. */
export function stateForColumn(states: LinearState[], column: Pick<KanbanColumn, 'type'>): LinearState | undefined {
  return statesOfType(states, column.type ?? '')[0]
}

/** What replaces the conversation: the Linear issues as a Kanban board, or as a list. */
export type BoardKind = 'kanban' | 'linear'
