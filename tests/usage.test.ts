import { describe, expect, it } from 'vitest'
import { dayKey, summarizeUsage } from '../src/shared/usage'
import { findOccurrences } from '../src/shared/search'

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime()
const projects = [
  { id: 'p1', name: 'Alpha' },
  { id: 'p2', name: 'Beta' }
]
const features = [
  { id: 'f1', title: 'Login', projectId: 'p1' },
  { id: 'f2', title: 'Billing', projectId: 'p2' },
  { id: 'f3', title: 'Search', projectId: 'p1' }
]

describe('summarizeUsage', () => {
  const now = at(2026, 10, 18)
  const turns = [
    { featureId: 'f1', at: at(2026, 10, 18, 9), costUsd: 1 },
    { featureId: 'f1', at: at(2026, 10, 17), costUsd: 0.5 },
    { featureId: 'f2', at: at(2026, 10, 17), costUsd: 2 },
    { featureId: 'f3', at: at(2026, 10, 10), costUsd: 4 },
    { featureId: 'gone', at: at(2026, 10, 18), costUsd: 3 }
  ]

  it('covers the last days, empty ones included, oldest first', () => {
    const { byDay } = summarizeUsage(turns, features, projects, now, 3)
    expect(byDay.map((d) => d.day)).toEqual(['2026-10-16', '2026-10-17', '2026-10-18'])
    expect(byDay.map((d) => d.costUsd)).toEqual([0, 2.5, 4])
  })

  it('adds up by project and by feature, biggest first, over the window only', () => {
    const s = summarizeUsage(turns, features, projects, now, 3)
    expect(s.byProject).toEqual([
      { id: 'p2', name: 'Beta', costUsd: 2 },
      { id: 'p1', name: 'Alpha', costUsd: 1.5 }
    ])
    // The turn of a deleted agent counts in the day total but has no row to belong to.
    expect(s.byFeature.map((r) => r.name)).toEqual(['Billing', 'Login'])
    expect(s.totalUsd).toBe(6.5)
  })

  it('builds local day keys', () => {
    expect(dayKey(at(2026, 1, 5))).toBe('2026-01-05')
  })
})

describe('findOccurrences', () => {
  it('finds every occurrence, ignoring case', () => {
    expect(findOccurrences('Foo foo FOO', 'foo')).toEqual([0, 4, 8])
    expect(findOccurrences('aaaa', 'aa')).toEqual([0, 2])
    expect(findOccurrences('abc', '')).toEqual([])
    expect(findOccurrences('abc', 'x')).toEqual([])
  })
})
