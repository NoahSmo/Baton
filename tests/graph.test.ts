import { describe, expect, it } from 'vitest'
import { layoutGraph } from '../src/shared/graph'
import type { GitCommit } from '../src/shared/types'

const commit = (hash: string, ...parents: string[]): GitCommit => ({ hash, parents, subject: hash, author: '', time: 0, refs: [], head: false })

describe('layoutGraph', () => {
  it('keeps a linear history in one lane', () => {
    const rows = layoutGraph([commit('c', 'b'), commit('b', 'a'), commit('a')])
    expect(rows.map((r) => r.lane)).toEqual([0, 0, 0])
    expect(rows.every((r) => r.width === 1)).toBe(true)
  })

  it('opens a lane for a branch and closes it where it forks', () => {
    // d (feature) and c (main) both sit on b.
    const rows = layoutGraph([commit('d', 'b'), commit('c', 'b'), commit('b', 'a'), commit('a')])
    expect(rows.map((r) => r.lane)).toEqual([0, 1, 0, 0])
    // c's line bends into d's lane at once, so b is reached by a single line.
    expect(rows[1].below).toEqual([
      { from: 0, to: 0 },
      { from: 1, to: 0 }
    ])
    expect(rows[2].above).toEqual([{ lane: 0, toDot: true }])
    expect(rows[3].above).toEqual([{ lane: 0, toDot: true }])
  })

  it('gives a merge a line to each parent', () => {
    const rows = layoutGraph([commit('m', 'a', 'b'), commit('b', 'r'), commit('a', 'r'), commit('r')])
    expect(rows[0].below).toEqual([
      { from: 0, to: 0 },
      { from: 0, to: 1 }
    ])
    expect(rows[1].lane).toBe(1)
    expect(rows[2].lane).toBe(0)
  })
})
