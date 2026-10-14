import { describe, expect, it } from 'vitest'
import { formatReset } from '../src/shared/time'

describe('formatReset', () => {
  const now = new Date(2026, 9, 14, 12, 0).getTime()
  const at = (d: Date) => Math.floor(d.getTime() / 1000)

  it('is empty without a reset time', () => {
    expect(formatReset(undefined, 'en', now)).toBeUndefined()
  })

  it('gives only the time for a reset today', () => {
    const out = formatReset(at(new Date(2026, 9, 14, 19, 0)), 'en', now)!
    expect(out).toMatch(/7:00/)
    expect(out).not.toMatch(/Oct/)
  })

  it('names the day for a reset on another day', () => {
    expect(formatReset(at(new Date(2026, 9, 13, 23, 0)), 'en', now)).toMatch(/Oct.*11:00/)
    expect(formatReset(at(new Date(2026, 9, 20, 19, 0)), 'en', now)).toMatch(/Oct.*7:00/)
  })
})
