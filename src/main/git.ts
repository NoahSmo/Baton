import { readFileSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'
import type { GitBranch, GitChange, GitChangeKind, GitStatus } from '../shared/types'
import { git } from './worktree'

function kindOf(xy: string): GitChangeKind {
  if (xy[1] === 'D' || xy === 'D.') return 'deleted'
  if (xy[0] === 'A') return 'added'
  if (xy[0] === 'R' || xy[0] === 'C') return 'renamed'
  return 'modified'
}

/** Text after the nth space: paths come last on a status line and may hold spaces themselves. */
function afterFields(line: string, fields: number): string {
  let at = 0
  for (let i = 0; i < fields; i++) at = line.indexOf(' ', at) + 1
  return line.slice(at)
}

/** Reads the output of `git status --porcelain=v2 --branch -z`. */
export function parseStatus(out: string): GitStatus {
  const status: GitStatus = { branch: null, head: '', upstream: null, ahead: 0, behind: 0, changes: [] }
  const records = out.split('\0')
  for (let i = 0; i < records.length; i++) {
    const line = records[i]
    if (line.startsWith('# branch.oid ')) status.head = line.slice(13, 20)
    else if (line.startsWith('# branch.head ')) status.branch = line.slice(14) === '(detached)' ? null : line.slice(14)
    else if (line.startsWith('# branch.upstream ')) status.upstream = line.slice(18)
    else if (line.startsWith('# branch.ab ')) {
      const [ahead, behind] = line.slice(12).split(' ')
      status.ahead = Number(ahead)
      status.behind = -Number(behind)
    } else if (line.startsWith('1 ')) status.changes.push({ path: afterFields(line, 8), kind: kindOf(line.slice(2, 4)) })
    else if (line.startsWith('2 ')) {
      status.changes.push({ path: afterFields(line, 9), kind: kindOf(line.slice(2, 4)) })
      // A rename is followed by the path it came from.
      i++
    } else if (line.startsWith('u ')) status.changes.push({ path: afterFields(line, 10), kind: 'conflicted' })
    else if (line.startsWith('? ')) status.changes.push({ path: line.slice(2), kind: 'untracked' })
  }
  status.changes.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
  return status
}

export async function gitStatus(root: string): Promise<GitStatus> {
  // Without optional locks, looking at the status never rewrites the index it is watched through.
  return parseStatus(
    await git(root, '--no-optional-locks', 'status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all')
  )
}

/** Branch checked out in each worktree of a repository, from `git worktree list --porcelain`. */
export function parseWorktrees(out: string): { path: string; branch: string | null }[] {
  return out
    .split(/\n\n+/)
    .filter((block) => block.startsWith('worktree '))
    .map((block) => {
      const lines = block.split('\n')
      const branch = lines.find((l) => l.startsWith('branch refs/heads/'))
      return { path: lines[0].slice(9), branch: branch ? branch.slice(18) : null }
    })
}

/**
 * Branches a worktree can switch to, the most recently committed first. `heldBy`
 * is the folder of the other worktree a branch is checked out in, if any.
 */
export async function listBranches(root: string): Promise<GitBranch[]> {
  const [refs, worktrees, current] = await Promise.all([
    git(root, 'for-each-ref', '--sort=-committerdate', '--format=%(refname)', 'refs/heads', 'refs/remotes'),
    git(root, 'worktree', 'list', '--porcelain'),
    git(root, 'branch', '--show-current').catch(() => '')
  ])
  const held = new Map(parseWorktrees(worktrees).flatMap((w) => (w.branch ? [[w.branch, w.path] as const] : [])))
  const names = refs.split('\n').filter(Boolean)
  const branches = new Map<string, GitBranch>()
  for (const ref of names) {
    if (!ref.startsWith('refs/heads/')) continue
    const name = ref.slice(11)
    branches.set(name, { name, current: name === current, remote: false, heldBy: name === current ? null : (held.get(name) ?? null) })
  }
  for (const ref of names) {
    if (!ref.startsWith('refs/remotes/')) continue
    // "origin/feat/x" is offered as "feat/x": switching to it creates the local branch.
    const name = ref.slice(13).replace(/^[^/]+\//, '')
    if (name !== 'HEAD' && !branches.has(name)) branches.set(name, { name, current: false, remote: true, heldBy: null })
  }
  return [...branches.values()]
}

export async function switchBranch(root: string, branch: string): Promise<void> {
  // The name comes from the renderer: only a branch git itself listed reaches the command line.
  const target = (await listBranches(root)).find((b) => b.name === branch)
  if (!target || target.heldBy) throw new Error(`Cannot switch to ${branch}`)
  if (target.current) return
  try {
    await git(root, 'switch', branch)
  } catch (err) {
    // git explains refusals (local changes in the way…) on stderr.
    const stderr = (err as { stderr?: string }).stderr?.trim()
    throw stderr ? new Error(stderr) : err
  }
}

/** Branches work gets merged into: a branch whose commits one of them holds has landed. */
const TRUNKS = new Set(['main', 'master', 'dev', 'develop'])

/** Whether a remote-tracking ref is a trunk; `HEAD` stands for the remote's default branch. */
export function isTrunkRef(ref: string): boolean {
  const name = ref.replace(/^refs\/remotes\/[^/]+\//, '')
  return name === 'HEAD' || TRUNKS.has(name)
}

/**
 * Whether a worktree has nothing left to lose: no uncommitted change, and commits
 * of its own that a trunk of a remote already holds. A branch still where it was
 * created has not landed, it has not started.
 */
export async function hasLanded(root: string): Promise<boolean> {
  const status = await gitStatus(root)
  if (!status.branch || TRUNKS.has(status.branch) || status.changes.length) return false
  const [tip, history, holders] = await Promise.all([
    git(root, 'rev-parse', 'HEAD'),
    git(root, 'reflog', 'show', '--format=%H', `refs/heads/${status.branch}`),
    git(root, 'for-each-ref', '--contains', 'HEAD', '--format=%(refname)', 'refs/remotes')
  ])
  const created = history.split('\n').pop()
  return tip !== created && holders.split('\n').some(isTrunkRef)
}

/**
 * Where git keeps the state of a worktree (HEAD, index): `.git` itself in a
 * plain clone, the folder its `.git` file points to in a linked worktree.
 */
export function gitDirOf(root: string): string | null {
  const dotGit = join(root, '.git')
  try {
    if (statSync(dotGit).isDirectory()) return dotGit
    const target = readFileSync(dotGit, 'utf8').match(/^gitdir: (.+)$/m)?.[1].trim()
    if (!target) return null
    return isAbsolute(target) ? target : resolve(root, target)
  } catch {
    return null
  }
}

/** When git last wrote the state of a worktree (checkout, staging, commit); 0 when it cannot tell. */
export function lastGitActivity(root: string): number {
  const dir = gitDirOf(root)
  if (!dir) return 0
  return Math.max(
    0,
    ...['HEAD', 'index', join('logs', 'HEAD')].map((name) => {
      try {
        return statSync(join(dir, name)).mtimeMs
      } catch {
        return 0
      }
    })
  )
}

/**
 * Worktrees of a repository under `root` that `known` does not account for: an
 * agent adds its own when its work reaches into another project.
 */
export async function strayWorktrees(
  repo: string,
  root: string,
  known: ReadonlySet<string>
): Promise<{ path: string; branch: string | null }[]> {
  const worktrees = parseWorktrees(await git(repo, 'worktree', 'list', '--porcelain'))
  return worktrees.filter((w) => w.path.startsWith(root + sep) && !known.has(w.path))
}
