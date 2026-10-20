import type { GitCommit } from './types'

/** A commit placed on the graph: the lane it sits in and the lines passing through its row. */
export interface GraphRow {
  commit: GitCommit
  lane: number
  /** Lanes of the lines coming into the row from above, each ending at the commit's dot or passing straight through. */
  above: { lane: number; toDot: boolean }[]
  /** Lanes of the lines leaving the row downward: the dot's own parents, and lines passing through. */
  below: { from: number; to: number }[]
  /** Number of lanes in use at this row, to size the drawing. */
  width: number
}

/**
 * Lays commits (newest first, parents after children) out on lanes, the way `git log --graph` does:
 * a lane follows the commit it waits for, and a commit takes the lane of the first child that expected it.
 */
export function layoutGraph(commits: GitCommit[]): GraphRow[] {
  /** Hash each lane is waiting for; null for a free lane. */
  let lanes: (string | null)[] = []
  const rows: GraphRow[] = []

  for (const commit of commits) {
    const waiting = lanes.flatMap((hash, lane) => (hash === commit.hash ? [lane] : []))
    const lane = waiting.length ? waiting[0] : (lanes.indexOf(null) === -1 ? lanes.length : lanes.indexOf(null))
    const above = lanes.flatMap((hash, at) => (hash === null ? [] : [{ lane: at, toDot: hash === commit.hash }]))

    const next = [...lanes]
    for (const at of waiting) next[at] = null
    const below: GraphRow['below'] = []
    // Lines that were not for this commit carry on straight down.
    next.forEach((hash, at) => {
      if (hash !== null) below.push({ from: at, to: at })
    })
    commit.parents.forEach((parent, i) => {
      const existing = next.indexOf(parent)
      if (existing !== -1) {
        below.push({ from: lane, to: existing })
        return
      }
      // The first parent continues in the commit's own lane; the others open a lane of their own.
      const target = i === 0 ? lane : next.indexOf(null) === -1 || next.indexOf(null) === lane ? next.length : next.indexOf(null)
      while (next.length <= target) next.push(null)
      next[target] = parent
      below.push({ from: lane, to: target })
    })
    while (next.length && next[next.length - 1] === null) next.pop()

    rows.push({ commit, lane, above, below, width: Math.max(lane + 1, lanes.length, next.length) })
    lanes = next
  }
  return rows
}
