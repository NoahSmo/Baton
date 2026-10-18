import type { Feature, FeatureStatus } from './types'

export type SidebarSort = 'status' | 'activity' | 'created'

export const SIDEBAR_SORTS: SidebarSort[] = ['status', 'activity', 'created']

/** What needs the user comes first. */
const STATUS_RANK: Record<FeatureStatus, number> = {
  waiting: 0,
  working: 1,
  queued: 2,
  error: 3,
  limited: 4,
  done: 5,
  idle: 6
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Every word of the query is found in the title, the branch or the issue identifier. */
export function matchesQuery(feature: Feature, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const haystack = fold(`${feature.title} ${feature.branch} ${feature.linear?.identifier ?? ''}`)
  return words.every((w) => haystack.includes(w))
}

export interface FeatureView {
  query: string
  statuses: FeatureStatus[]
  sort: SidebarSort
}

function compare(sort: SidebarSort): (a: Feature, b: Feature) => number {
  return (a, b) => {
    // Pinned agents stay on top whatever the order.
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (sort === 'status' && STATUS_RANK[a.status] !== STATUS_RANK[b.status]) return STATUS_RANK[a.status] - STATUS_RANK[b.status]
    if (sort === 'activity' || sort === 'status') return b.updatedAt - a.updatedAt
    return b.createdAt - a.createdAt
  }
}

/**
 * The list the sidebar draws: filtered, sorted, and with the archived agents set apart.
 * A status filter nobody has any more (agents change state) is ignored rather than showing nothing.
 */
export function arrangeFeatures(features: Feature[], view: FeatureView): { shown: Feature[]; archived: Feature[] } {
  const statuses = view.statuses.filter((s) => features.some((f) => f.status === s))
  const keep = (f: Feature) => matchesQuery(f, view.query) && (!statuses.length || statuses.includes(f.status))
  const sorted = features.filter(keep).sort(compare(view.sort))
  return { shown: sorted.filter((f) => !f.archived), archived: sorted.filter((f) => f.archived) }
}

/** The agent that has waited longest for an answer, other than the one on screen. */
export function nextWaiting(features: Feature[], currentId: string | null): Feature | null {
  const waiting = features.filter((f) => f.status === 'waiting' && f.id !== currentId && !f.archived)
  return waiting.sort((a, b) => a.updatedAt - b.updatedAt)[0] ?? null
}

/** Neighbour of the selected agent in the list, wrapping around; the first one when none is selected. */
export function neighbour(list: Feature[], currentId: string | null, step: 1 | -1): Feature | null {
  if (!list.length) return null
  const at = list.findIndex((f) => f.id === currentId)
  if (at === -1) return list[step === 1 ? 0 : list.length - 1]
  return list[(at + step + list.length) % list.length]
}
