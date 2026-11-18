import { describe, expect, it } from 'vitest'
import { BUILTIN_PRESETS, parsePresets, presetMatches } from '../src/shared/presets'

describe('presets', () => {
  it('matches a preset on all three settings', () => {
    const deep = BUILTIN_PRESETS.find((p) => p.id === 'deep')!
    expect(presetMatches(deep, 'opus', 'high', 'plan')).toBe(true)
    expect(presetMatches(deep, 'opus', null, 'plan')).toBe(false)
    expect(presetMatches(deep, 'sonnet', 'high', 'plan')).toBe(false)
  })

  it('reads stored presets and drops invalid ones', () => {
    const good = { id: 'a', name: ' Mine ', model: 'claude-opus-5-5', effort: null, permissionMode: 'plan' }
    const raw = JSON.stringify([good, { ...good, model: 'gpt' }, { ...good, effort: 'huge' }, { ...good, name: ' ' }, null])
    expect(parsePresets(raw)).toEqual([{ ...good, name: 'Mine' }])
    expect(parsePresets('nope')).toEqual([])
    expect(parsePresets(null)).toEqual([])
  })
})
