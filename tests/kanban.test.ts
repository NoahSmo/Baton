import { describe, expect, it } from 'vitest'
import { groupByAssignee, groupByProject, issuesInColumn, priorityColumns, sortByPriority, stateForColumn, statesOfType, statusColumns } from '../src/shared/kanban'
import { groupProjectsByStatus } from '../src/shared/linear'
import type { LinearIssue, LinearProject, LinearState } from '../src/shared/types'

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
  it('has one column per workflow category, whatever the statuses are called', () => {
    const cols = statusColumns([issue('a', 'In Review', 'started', 2), issue('b', 'Doing', 'started', 1, 't2')])
    expect(cols.map((c) => c.key)).toEqual(['backlog', 'unstarted', 'started', 'completed'])
    expect(cols[2].issues.map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('shows triage only when an issue is in it', () => {
    expect(statusColumns([issue('a', 'Triage', 'triage', 0)]).map((c) => c.key)[0]).toBe('triage')
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
  it('takes the first status of the category, by position', () => {
    expect(stateForColumn(states, { type: 'started' })?.id).toBe('s2')
    expect(stateForColumn(states, { type: 'triage' })).toBeUndefined()
  })

  it('lists every status of a category in order', () => {
    expect(statesOfType(states, 'started').map((s) => s.id)).toEqual(['s2', 's3'])
  })
})

describe('groupByProject', () => {
  const inProject = (id: string, project: string | null): LinearIssue => ({ ...issue(id, 'Todo', 'unstarted', 0), linearProjectId: project })
  const names: Record<string, string> = { p1: 'Zed', p2: 'Alpha' }

  it('makes one lane per project by name, with issues of no project last', () => {
    const lanes = groupByProject([inProject('a', null), inProject('b', 'p1'), inProject('c', 'p2'), inProject('d', 'p1')], (id) => names[id], 'No project')
    expect(lanes.map((l) => l.name)).toEqual(['Alpha', 'Zed', 'No project'])
    expect(lanes[1].issues.map((i) => i.id)).toEqual(['b', 'd'])
  })

  it('splits a lane across the shared columns', () => {
    const issues = [inProject('a', 'p1'), { ...inProject('b', 'p2'), stateName: 'In Progress', stateType: 'started' }]
    const cols = statusColumns(issues)
    const [alpha, zed] = groupByProject(issues, (id) => names[id], 'No project')
    const [todo, doing] = [cols[1], cols[2]]
    expect(issuesInColumn(zed, todo).map((i) => i.id)).toEqual(['a'])
    expect(issuesInColumn(alpha, todo)).toEqual([])
    expect(issuesInColumn(alpha, doing).map((i) => i.id)).toEqual(['b'])
  })
})

describe('groupProjectsByStatus', () => {
  const project = (id: string, type: string | null): LinearProject => ({
    id,
    name: id,
    status: type ? { name: type, type } : null,
    labels: [],
    teams: []
  })

  it('orders groups from active to over, statusless last, keeping the order within a group', () => {
    const groups = groupProjectsByStatus([project('a', 'completed'), project('b', null), project('c', 'started'), project('d', 'planned'), project('e', 'started')])
    expect(groups.map((g) => g.type)).toEqual(['started', 'planned', 'completed', 'none'])
    expect(groups[0].projects.map((p) => p.id)).toEqual(['c', 'e'])
  })
})

describe('groupByAssignee', () => {
  it('makes one lane per assignee by name, unassigned last', () => {
    const who = (id: string, name: string | null): LinearIssue => ({ ...issue(id, 'Todo', 'unstarted', 0), assigneeName: name })
    const lanes = groupByAssignee([who('a', null), who('b', 'Zoe'), who('c', 'Ann'), who('d', 'Zoe')], 'Unassigned')
    expect(lanes.map((l) => l.name)).toEqual(['Ann', 'Zoe', 'Unassigned'])
    expect(lanes[1].issues.map((i) => i.id)).toEqual(['b', 'd'])
  })
})
