import { DEFAULT_NOTIFICATION_PREFS, type FeatureStatus, type NotificationPrefs } from './types'

const EVENTS = ['waiting', 'done', 'error', 'limited'] as const

/** Stored preferences, completed with the defaults for anything missing or malformed. */
export function normalizePrefs(stored: unknown): NotificationPrefs {
  const given = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>
  const out = { ...DEFAULT_NOTIFICATION_PREFS }
  for (const key of [...EVENTS, 'sound', 'whenFocused'] as const) {
    if (typeof given[key] === 'boolean') out[key] = given[key]
  }
  return out
}

export interface NotifyContext {
  windowFocused: boolean
  /** Agent on screen, null when none. */
  shownFeatureId: string | null
  featureId: string
}

/** Whether a feature reaching `status` deserves a notification. */
export function shouldNotify(prefs: NotificationPrefs, status: FeatureStatus, ctx: NotifyContext): boolean {
  if (!(EVENTS as readonly string[]).includes(status)) return false
  if (!prefs[status as (typeof EVENTS)[number]]) return false
  if (!ctx.windowFocused) return true
  // With the window in front, only an agent the user is not looking at calls for a notification, and only if asked.
  return prefs.whenFocused && ctx.shownFeatureId !== ctx.featureId
}
