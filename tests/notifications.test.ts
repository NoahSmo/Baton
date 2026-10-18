import { describe, expect, it } from 'vitest'
import { normalizePrefs, shouldNotify } from '../src/shared/notifications'
import { DEFAULT_NOTIFICATION_PREFS } from '../src/shared/types'

const away = { windowFocused: false, shownFeatureId: null, featureId: 'a' }

describe('shouldNotify', () => {
  it('keeps the historical behaviour by default: notify away from the window, never in front of it', () => {
    expect(shouldNotify(DEFAULT_NOTIFICATION_PREFS, 'waiting', away)).toBe(true)
    expect(shouldNotify(DEFAULT_NOTIFICATION_PREFS, 'waiting', { ...away, windowFocused: true })).toBe(false)
  })

  it('honours each event on its own', () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS, done: false }
    expect(shouldNotify(prefs, 'done', away)).toBe(false)
    expect(shouldNotify(prefs, 'error', away)).toBe(true)
  })

  it('never notifies for statuses that are no event', () => {
    expect(shouldNotify(DEFAULT_NOTIFICATION_PREFS, 'working', away)).toBe(false)
    expect(shouldNotify(DEFAULT_NOTIFICATION_PREFS, 'idle', away)).toBe(false)
  })

  it('can notify in front of the window, except for the agent on screen', () => {
    const prefs = { ...DEFAULT_NOTIFICATION_PREFS, whenFocused: true }
    expect(shouldNotify(prefs, 'done', { windowFocused: true, shownFeatureId: 'b', featureId: 'a' })).toBe(true)
    expect(shouldNotify(prefs, 'done', { windowFocused: true, shownFeatureId: 'a', featureId: 'a' })).toBe(false)
  })
})

describe('normalizePrefs', () => {
  it('fills in the defaults and drops what is malformed', () => {
    expect(normalizePrefs(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFS)
    expect(normalizePrefs({ done: false, sound: 'yes', extra: 1 })).toEqual({ ...DEFAULT_NOTIFICATION_PREFS, done: false })
  })
})
