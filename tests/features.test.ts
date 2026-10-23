import { describe, expect, it } from 'vitest'
import { arrangeFeatures, matchesQuery, neighbour, nextWaiting } from '../src/shared/features'
import type { Feature } from '../src/shared/types'

let n = 0
function feature(patch: Partial<Feature>): Feature {
  n++
  return {
    id: `f${n}`,
    projectId: 'p',
    title: `Feature ${n}`,
    linear: null,
    branch: `feat/feature-${n}`,
    worktreePath: `/w/${n}`,
    status: 'idle',
    permissionMode: 'default',
    agentModel: 'sonnet',
    sessionId: null,
    model: null,
    costUsd: 0,
    contextTokens: 0,
    limitResetsAt: null,
    pinned: false,
    archived: false,
    queuePosition: null,
    prUrl: null,
    turnBase: null,
    createdAt: n,
    updatedAt: n,
    ...patch
  }
}

const view = { query: '', statuses: [], sort: 'status' as const }

describe('matchesQuery', () => {
  it('looks at title, branch and issue identifier, without caring for case or accents', () => {
    const f = feature({ title: 'Réglages', branch: 'feat/settings', linear: { issueId: 'i', identifier: 'ENG-42', url: '' } })
    expect(matchesQuery(f, 'reglages')).toBe(true)
    expect(matchesQuery(f, 'SETTINGS')).toBe(true)
    expect(matchesQuery(f, 'eng-42')).toBe(true)
    expect(matchesQuery(f, 'settings eng')).toBe(true)
    expect(matchesQuery(f, 'settings nope')).toBe(false)
    expect(matchesQuery(f, '   ')).toBe(true)
  })
})

describe('arrangeFeatures', () => {
  it('puts agents that need an answer first, then the others by recent activity', () => {
    const idle = feature({ status: 'idle', updatedAt: 50 })
    const done = feature({ status: 'done', updatedAt: 40 })
    const waiting = feature({ status: 'waiting', updatedAt: 10 })
    const working = feature({ status: 'working', updatedAt: 20 })
    expect(arrangeFeatures([idle, done, waiting, working], view).shown).toEqual([waiting, working, done, idle])
  })

  it('keeps pinned agents on top in every order', () => {
    const old = feature({ pinned: true, createdAt: 1, updatedAt: 1 })
    const recent = feature({ createdAt: 99, updatedAt: 99, status: 'waiting' })
    for (const sort of ['status', 'activity', 'created'] as const) {
      expect(arrangeFeatures([recent, old], { ...view, sort }).shown[0]).toBe(old)
    }
  })

  it('sorts by creation date', () => {
    const a = feature({ createdAt: 5, updatedAt: 100 })
    const b = feature({ createdAt: 9, updatedAt: 1 })
    expect(arrangeFeatures([a, b], { ...view, sort: 'created' }).shown).toEqual([b, a])
    expect(arrangeFeatures([a, b], { ...view, sort: 'activity' }).shown).toEqual([a, b])
  })

  it('sorts by cost, dearest first, and by name', () => {
    const a = feature({ title: 'Beta', costUsd: 1 })
    const b = feature({ title: 'alpha', costUsd: 5 })
    expect(arrangeFeatures([a, b], { ...view, sort: 'cost' }).shown).toEqual([b, a])
    expect(arrangeFeatures([a, b], { ...view, sort: 'name' }).shown).toEqual([b, a])
  })

  it('sets archived agents apart and applies the filters to both lists', () => {
    const shown = feature({ title: 'Login', status: 'done' })
    const archived = feature({ title: 'Login page', archived: true, status: 'done' })
    const other = feature({ title: 'Billing', status: 'done' })
    const out = arrangeFeatures([shown, archived, other], { ...view, query: 'login' })
    expect(out.shown).toEqual([shown])
    expect(out.archived).toEqual([archived])
    // Nobody is working any more: the filter lapses instead of emptying the list.
    expect(arrangeFeatures([shown, other], { ...view, statuses: ['working'] }).shown).toHaveLength(2)
    expect(arrangeFeatures([shown, other], { ...view, statuses: ['done'] }).shown).toHaveLength(2)
  })
})

describe('nextWaiting', () => {
  it('picks the agent that has waited longest, never the one on screen', () => {
    const a = feature({ status: 'waiting', updatedAt: 30 })
    const b = feature({ status: 'waiting', updatedAt: 10 })
    const c = feature({ status: 'working', updatedAt: 1 })
    expect(nextWaiting([a, b, c], null)).toBe(b)
    expect(nextWaiting([a, b, c], b.id)).toBe(a)
    expect(nextWaiting([c], null)).toBeNull()
    expect(nextWaiting([a], a.id)).toBeNull()
  })

  it('ignores archived agents', () => {
    expect(nextWaiting([feature({ status: 'waiting', archived: true })], null)).toBeNull()
  })
})

describe('neighbour', () => {
  const list = [feature({}), feature({}), feature({})]
  it('wraps around', () => {
    expect(neighbour(list, list[2].id, 1)).toBe(list[0])
    expect(neighbour(list, list[0].id, -1)).toBe(list[2])
    expect(neighbour(list, list[0].id, 1)).toBe(list[1])
  })
  it('starts from an end when nothing is selected', () => {
    expect(neighbour(list, null, 1)).toBe(list[0])
    expect(neighbour(list, null, -1)).toBe(list[2])
    expect(neighbour([], null, 1)).toBeNull()
  })
})
