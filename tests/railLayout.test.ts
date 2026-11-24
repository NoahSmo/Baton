import { describe, expect, it } from 'vitest'
import {
  deleteGroup,
  flatten,
  groupProject,
  moveGroup,
  moveProject,
  parseLayout,
  reconcile,
  shift,
  ungroupProject,
  updateGroup,
  type RailLayout
} from '../src/shared/railLayout'

const p = (id: string) => ({ type: 'project' as const, id })
const g = (id: string, projectIds: string[], collapsed = false) => ({ type: 'group' as const, id, name: id, collapsed, projectIds })

describe('reconcile', () => {
  it('lists every project once in database order when nothing is stored', () => {
    expect(reconcile([], ['a', 'b'])).toEqual([p('a'), p('b')])
  })

  it('drops removed projects, appends new ones and ignores duplicates', () => {
    const stored: RailLayout = [g('G', ['a', 'gone']), p('b'), p('a')]
    expect(reconcile(stored, ['a', 'b', 'c'])).toEqual([g('G', ['a']), p('b'), p('c')])
  })
})

describe('flatten', () => {
  it('reads groups in place, folded or not', () => {
    expect(flatten([p('a'), g('G', ['b', 'c'], true), p('d')])).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('moveProject', () => {
  const layout: RailLayout = [p('a'), g('G', ['b', 'c']), p('d')]

  it('moves before and after a top-level project', () => {
    expect(flatten(moveProject(layout, 'd', { kind: 'near', id: 'a', after: false }))).toEqual(['d', 'a', 'b', 'c'])
    expect(moveProject(layout, 'a', { kind: 'near', id: 'd', after: true })).toEqual([g('G', ['b', 'c']), p('d'), p('a')])
  })

  it('joins the group of the project it lands next to', () => {
    expect(moveProject(layout, 'a', { kind: 'near', id: 'c', after: false })).toEqual([g('G', ['b', 'a', 'c']), p('d')])
  })

  it('goes first into a group dropped on', () => {
    expect(moveProject(layout, 'd', { kind: 'into', groupId: 'G' })).toEqual([p('a'), g('G', ['d', 'b', 'c'])])
  })

  it('leaves a group to sit at top level', () => {
    expect(moveProject(layout, 'b', { kind: 'near', id: 'd', after: false })).toEqual([p('a'), g('G', ['c']), p('b'), p('d')])
  })

  it('goes last on "end" and ignores a drop on itself', () => {
    expect(flatten(moveProject(layout, 'a', { kind: 'end' }))).toEqual(['b', 'c', 'd', 'a'])
    expect(moveProject(layout, 'a', { kind: 'near', id: 'a', after: true })).toBe(layout)
  })
})

describe('moveGroup', () => {
  const layout: RailLayout = [p('a'), g('G', ['b']), g('H', ['c']), p('d')]

  it('moves next to a project or group', () => {
    expect(moveGroup(layout, 'G', { kind: 'near', id: 'd', after: true })).toEqual([p('a'), g('H', ['c']), p('d'), g('G', ['b'])])
  })

  it('treats a project of another group as that group', () => {
    expect(moveGroup(layout, 'G', { kind: 'near', id: 'c', after: true })).toEqual([p('a'), g('H', ['c']), g('G', ['b']), p('d')])
  })

  it('does nothing for an unknown group', () => {
    expect(moveGroup(layout, 'nope', { kind: 'end' })).toBe(layout)
  })
})

describe('groups', () => {
  it('creates a group where a top-level project stood', () => {
    expect(groupProject([p('a'), p('b')], 'b', 'G', 'Group')).toEqual([p('a'), { ...g('G', ['b']), name: 'Group' }])
  })

  it('creates a group below the one the project leaves', () => {
    expect(groupProject([g('H', ['a', 'b'])], 'a', 'G', 'Group')).toEqual([g('H', ['b']), { ...g('G', ['a']), name: 'Group' }])
  })

  it('takes a project out below its group', () => {
    expect(ungroupProject([g('G', ['a', 'b']), p('c')], 'a')).toEqual([g('G', ['b']), p('a'), p('c')])
  })

  it('dissolves a group in place', () => {
    expect(deleteGroup([p('a'), g('G', ['b', 'c'])], 'G')).toEqual([p('a'), p('b'), p('c')])
  })

  it('renames and folds', () => {
    expect(updateGroup([g('G', ['a'])], 'G', { name: 'Work', collapsed: true })).toEqual([{ ...g('G', ['a'], true), name: 'Work' }])
  })
})

describe('parseLayout', () => {
  it('round-trips a layout', () => {
    const layout: RailLayout = [p('a'), g('G', ['b'], true)]
    expect(parseLayout(JSON.stringify(layout))).toEqual(layout)
  })

  it('falls back to empty on garbage', () => {
    expect(parseLayout(null)).toEqual([])
    expect(parseLayout('{')).toEqual([])
    expect(parseLayout('{"a":1}')).toEqual([])
    expect(parseLayout('[1,null,{"type":"x","id":"a"}]')).toEqual([])
  })
})

describe('shift', () => {
  const layout: RailLayout = [p('a'), g('G', ['b', 'c']), p('d')]

  it('swaps with the neighbour at top level, groups included', () => {
    expect(shift(layout, 'a', 1)).toEqual([g('G', ['b', 'c']), p('a'), p('d')])
    expect(shift(layout, 'G', -1)).toEqual([g('G', ['b', 'c']), p('a'), p('d')])
    expect(shift(layout, 'a', -1)).toBe(layout)
  })

  it('moves inside a group, then out of it past the edge', () => {
    expect(shift(layout, 'b', 1)).toEqual([p('a'), g('G', ['c', 'b']), p('d')])
    expect(shift(layout, 'b', -1)).toEqual([p('a'), p('b'), g('G', ['c']), p('d')])
    expect(shift(layout, 'c', 1)).toEqual([p('a'), g('G', ['b']), p('c'), p('d')])
  })
})
