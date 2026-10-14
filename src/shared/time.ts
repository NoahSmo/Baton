/**
 * When a usage window resets: the time alone when it is today, with the day otherwise,
 * so a reset from yesterday or a weekly one is never read as a time of today.
 */
export function formatReset(epochSeconds: number | undefined, lang: string, now = Date.now()): string | undefined {
  if (!epochSeconds) return undefined
  const at = new Date(epochSeconds * 1000)
  const time = at.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
  if (at.toDateString() === new Date(now).toDateString()) return time
  const day = at.toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day} ${time}`
}
