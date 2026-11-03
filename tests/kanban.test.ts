import { describe, expect, it } from 'vitest'
import { priorityColumns, sortByPriority, stateForColumn, statusColumns } from '../src/shared/kanban'
import type { LinearIssue, LinearState } from '../src/shared/types'

const issue = (id: string, stateName: string, stateType: string, priority: number, teamId = 't1'): LinearIssue => ({
  id,
  identifier: id.toUpperCase(),
  title: id,
  description: null,
  url: '',
  branchName: '',
  stateName,
  stateType,
  stateId: stateName,
  teamId,
  linearProjectId: null,
  assigneeName: null,
  priority
})

const states: LinearState[] = [
  { id: 's1', name: 'Todo', type: 'unstarted', position: 1 },
  { id: 's2', name: 'In Progress', type: 'started', position: 2 },
  { id: 's3', name: 'In Review', type: 'started', position: 3 },
  { id: 's4', name: 'Done', type: 'completed', position: 4 },
  { id: 's0', name: 'Backlog', type: 'backlog', position: 0 }
]

describe('sortByPriority', () => {
  it('puts urgent first and "no priority" last', () => {
    const sorted = sortByPriority([issue('a', 'Todo', 'unstarted', 0), issue('b', 'Todo', 'unstarted', 4), issue('c', 'Todo', 'unstarted', 1)])
    expect(sorted.map((i) => i.id)).toEqual(['c', 'b', 'a'])
  })
})

describe('statusColumns', () => {
  it('orders columns by workflow, keeps empty open statuses, drops closed ones', () => {
    const cols = statusColumns([issue('a', 'In Review', 'started', 2)], { t1: states })
    expect(cols.map((c) => c.key)).toEqual(['Backlog', 'Todo', 'In Progress', 'In Review'])
    expect(cols[3].issues.map((i) => i.id)).toEqual(['a'])
  })

  it('shows the statuses of issues even when team states are not loaded yet', () => {
    const cols = statusColumns([issue('a', 'Todo', 'unstarted', 0), issue('b', 'In Progress', 'started', 0)], {})
    expect(cols.map((c) => c.key)).toEqual(['Todo', 'In Progress'])
  })

  it('merges same-named statuses of different teams and sorts cards by priority', () => {
    const cols = statusColumns([issue('a', 'Todo', 'unstarted', 4), issue('b', 'Todo', 'unstarted', 1, 't2')], { t1: states, t2: states })
    expect(cols.find((c) => c.key === 'Todo')?.issues.map((i) => i.id)).toEqual(['b', 'a'])
  })
})

describe('priorityColumns', () => {
  it('always has the five priorities, urgent to none', () => {
    const cols = priorityColumns([issue('a', 'Todo', 'unstarted', 0), issue('b', 'Todo', 'unstarted', 2)])
    expect(cols.map((c) => c.priority)).toEqual([1, 2, 3, 4, 0])
    expect(cols[1].issues.map((i) => i.id)).toEqual(['b'])
    expect(cols[4].issues.map((i) => i.id)).toEqual(['a'])
  })
})

describe('stateForColumn', () => {
  it('matches by name, then falls back to the first state of the category', () => {
    expect(stateForColumn(states, { key: 'In Review', type: 'started' })?.id).toBe('s3')
    expect(stateForColumn(states, { key: 'Doing', type: 'started' })?.id).toBe('s2')
    expect(stateForColumn(states, { key: 'Triage', type: 'triage' })).toBeUndefined()
  })
})
