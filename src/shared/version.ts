/** "v1.2.3" or "1.2.3-beta.1" → [1, 2, 3]; anything unparsable counts as 0. */
function parts(version: string): number[] {
  const core = version.trim().replace(/^v/i, '').split(/[-+]/)[0]
  return [0, 1, 2].map((i) => Number.parseInt(core.split('.')[i] ?? '0', 10) || 0)
}

/** Whether `candidate` is a later release than `current`. Pre-release suffixes are ignored. */
export function isNewer(candidate: string, current: string): boolean {
  const a = parts(candidate)
  const b = parts(current)
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return false
}
