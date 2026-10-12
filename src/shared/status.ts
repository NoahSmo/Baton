import type { FeatureStatus, UiEvent } from './types'

/**
 * Feature status is a pure projection of the event stream: every transition
 * the UI shows (sidebar dot, notifications, dock badge) comes from here.
 */
export function nextStatus(prev: FeatureStatus, ev: UiEvent): FeatureStatus {
  switch (ev.kind) {
    case 'user':
      return 'working'
    case 'permission_request':
      return 'waiting'
    case 'permission_resolved':
      return prev === 'waiting' ? 'working' : prev
    case 'result':
      if (ev.interrupted) return 'idle'
      // A usage-limit rejection also ends the turn with an error result; keep 'limited'.
      if (ev.isError) return prev === 'limited' ? 'limited' : 'error'
      return 'done'
    case 'rate_limit':
      return ev.status === 'rejected' ? 'limited' : prev
    case 'error':
      return 'error'
    default:
      return prev
  }
}

/** Statuses that deserve the user's attention when they are looking elsewhere. */
export function needsAttention(status: FeatureStatus): boolean {
  return status === 'waiting' || status === 'done' || status === 'error' || status === 'limited'
}

export function slugify(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  return slug || 'feature'
}
