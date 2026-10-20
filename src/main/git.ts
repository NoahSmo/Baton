import { execFile } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import type { CommitAction, GitBranch, GitChange, GitChangeKind, GitCommit, GitLog, GitStatus, MergePreview } from '../shared/types'
import { MAX_FILE_BYTES, resolveInside } from './files'
import { git, gitRaw } from './worktree'

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
      // A rename is followed by the path it came from.
      status.changes.push({ path: afterFields(line, 9), kind: kindOf(line.slice(2, 4)), from: records[++i] })
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

const LOG_MAX = 2000

/** Reads `git log --format=%H%x1f%P%x1f%an%x1f%at%x1f%D%x1f%s` records, one per line. */
export function parseLog(out: string, head: string): GitCommit[] {
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, parents, author, time, decorations, ...subject] = line.split('\x1f')
      const refs = decorations
        .split(', ')
        .filter(Boolean)
        // "HEAD -> main" is the branch; a bare "HEAD" says nothing the dot does not.
        .map((r) => r.replace(/^HEAD -> /, '').replace(/^tag: /, ''))
        .filter((r) => r !== 'HEAD' && !r.endsWith('/HEAD'))
      return {
        hash,
        parents: parents ? parents.split(' ') : [],
        subject: subject.join('\x1f'),
        author,
        time: Number(time),
        refs,
        head: hash === head,
        mine: false,
        unpushed: false,
        incoming: false
      }
    })
}

/** Ids printed by a `rev-list`; empty when the command is refused (no upstream, no such ref). */
async function revSet(root: string, ...args: string[]): Promise<Set<string>> {
  const out = await git(root, 'rev-list', ...args).catch(() => '')
  return new Set(out.split('\n').filter(Boolean))
}

/** Remote trunks, `origin/main` first when it exists. */
async function trunkRefs(root: string): Promise<string[]> {
  const out = await git(root, 'for-each-ref', '--format=%(refname)', 'refs/remotes').catch(() => '')
  const trunks = out.split('\n').filter((ref) => ref && isTrunkRef(ref) && !ref.endsWith('/HEAD'))
  return trunks.sort((a, b) => Number(b.endsWith('/main')) - Number(a.endsWith('/main')))
}

/** The latest commits of every branch, newest first and children before parents, for the graph. */
export async function gitLog(root: string, limit: number): Promise<GitLog> {
  const count = Math.min(Math.max(1, Math.floor(limit) || 1), LOG_MAX)
  const [head, out, trunks] = await Promise.all([
    git(root, 'rev-parse', 'HEAD').then((h) => h.trim(), () => ''),
    git(
      root,
      '--no-optional-locks',
      'log',
      '--branches',
      '--remotes',
      'HEAD',
      '--topo-order',
      `--max-count=${count + 1}`,
      '--decorate=short',
      '--format=%H%x1f%P%x1f%an%x1f%at%x1f%D%x1f%s'
    ).catch(() => ''),
    trunkRefs(root)
  ])
  const all = parseLog(out, head)
  const [mine, unpushed, incoming] = await Promise.all([
    trunks.length ? revSet(root, 'HEAD', '--not', ...trunks) : new Set<string>(),
    revSet(root, '@{u}..HEAD'),
    revSet(root, 'HEAD..@{u}')
  ])
  const commits = all.slice(0, count).map((c) => ({ ...c, mine: mine.has(c.hash), unpushed: unpushed.has(c.hash), incoming: incoming.has(c.hash) }))
  return { commits, more: all.length > count }
}

/** Files a commit changed against its first parent, or those that differ between two commits. */
export async function commitFiles(root: string, hash: string, from?: string): Promise<GitChange[]> {
  if (!isObjectId(hash) || (from !== undefined && !isObjectId(from))) throw new Error('Invalid revision')
  const out = from
    ? await gitRaw(root, 'diff', '--name-status', '-z', '--no-renames', from, hash)
    : await gitRaw(root, 'diff-tree', '--root', '-r', '-m', '--first-parent', '--no-commit-id', '--name-status', '-z', '--no-renames', hash)
  return parseNameStatus(out)
}

/** Names of the files a `git merge-tree --write-tree --name-only` run reports as conflicting. */
export function parseMergeConflicts(out: string): string[] {
  // The tree id, then the conflicted paths up to a blank line, then git's messages.
  const lines = out.split('\n').slice(1)
  const end = lines.indexOf('')
  return (end === -1 ? lines : lines.slice(0, end)).filter(Boolean)
}

/** Dry run of merging HEAD into the trunk of its remote, which touches neither the tree nor the index. */
export async function mergePreview(root: string): Promise<MergePreview | null> {
  const base = (await trunkRefs(root))[0]
  if (!base) return null
  const name = base.replace(/^refs\/remotes\//, '')
  try {
    await exec('git', ['merge-tree', '--write-tree', 'HEAD', base], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
    return { base: name, conflicts: [] }
  } catch (err) {
    const { code, stdout } = err as { code?: number; stdout?: string }
    // Exit 1 is a merge with conflicts; anything else (old git, unrelated histories) tells nothing.
    return code === 1 && stdout ? { base: name, conflicts: parseMergeConflicts(stdout) } : null
  }
}

/** Runs an operation on a commit; git is asked to undo a stopped cherry-pick or revert, so no half-done state stays. */
export async function commitOp(root: string, hash: string, action: CommitAction, name?: string): Promise<void> {
  if (!isObjectId(hash)) throw new Error('Invalid revision')
  // Only commits of this repository: a name git cannot resolve to a commit is no commit.
  await gitOrExplain(root, 'cat-file', '-e', `${hash}^{commit}`)
  if (action === 'branch') {
    const branch = name?.trim() ?? ''
    if (!branch) throw new Error('Empty branch name')
    await gitOrExplain(root, 'check-ref-format', '--branch', branch)
    // `branch`, not `switch -c`: the worktree stays where it is.
    await gitOrExplain(root, 'branch', '--', branch, hash)
    return
  }
  const verb = action === 'revert' ? 'revert' : 'cherry-pick'
  try {
    await gitOrExplain(root, verb, ...(action === 'revert' ? ['--no-edit'] : []), hash)
  } catch (err) {
    await git(root, verb, '--abort').catch(() => undefined)
    throw err
  }
}

/** Branch checked out in each worktree of a repository, from `git worktree list --porcelain`. */
/** A file as the last commit has it; null when the commit lacks it, or it is binary or too big to diff. */
export async function headContent(root: string, rel: string, ref?: string): Promise<string | null> {
  await resolveInside(root, rel)
  // A tree id from `snapshotTree`; anything else would be a way to read refs the user never named.
  if (ref !== undefined && !isObjectId(ref)) throw new Error('Invalid revision')
  try {
    const out = await gitRaw(root, 'show', `${ref ?? 'HEAD'}:./${rel}`)
    return out.length > MAX_FILE_BYTES || out.slice(0, 8000).includes('\0') ? null : out
  } catch {
    return null
  }
}

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

/** Runs a git command that may be refused; the rejection carries git's own explanation. */
async function gitOrExplain(root: string, ...args: string[]): Promise<string> {
  try {
    return await git(root, ...args)
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim()
    throw stderr ? new Error(stderr) : err
  }
}

/** Commits exactly `paths` of the status: whatever was staged beforehand is set aside. */
export async function commitChanges(root: string, message: string, paths: string[]): Promise<void> {
  if (!message.trim()) throw new Error('Empty commit message')
  // Only paths git itself reports reach the command line.
  const known = new Map((await gitStatus(root)).changes.map((c) => [c.path, c]))
  const chosen = paths.flatMap((p) => {
    const change = known.get(p)
    return change ? [change.path, ...(change.from ? [change.from] : [])] : []
  })
  if (!chosen.length) throw new Error('Nothing to commit')
  await gitOrExplain(root, 'reset', '--quiet')
  await gitOrExplain(root, 'add', '--all', '--', ...chosen)
  await gitOrExplain(root, 'commit', '--message', message.trim())
}

export async function pull(root: string): Promise<void> {
  // Fast-forward only: a pull never opens a merge the user did not ask for.
  await gitOrExplain(root, 'pull', '--ff-only')
}

export async function push(root: string): Promise<void> {
  const { branch, upstream } = await gitStatus(root)
  if (!branch) throw new Error('Cannot push a detached HEAD')
  await gitOrExplain(root, ...(upstream ? ['push'] : ['push', '--set-upstream', 'origin', branch]))
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

const exec = promisify(execFile)

export const isObjectId = (ref: string) => /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(ref)

/**
 * Id of a tree holding the worktree as it is now, untracked files included. It is
 * built in a throwaway index: the real one, the history and the branch are not touched.
 */
export async function snapshotTree(root: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'baton-snapshot-'))
  const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') }
  const run = async (...args: string[]) => (await exec('git', args, { cwd: root, env, maxBuffer: 16 * 1024 * 1024 })).stdout.trim()
  try {
    // A repository without a commit has no HEAD to start the index from.
    await run('read-tree', 'HEAD').catch(() => undefined)
    await run('add', '--all', '--force', '.')
    return await run('write-tree')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Reads the output of `git diff --name-status -z --no-renames`. */
export function parseNameStatus(out: string): GitChange[] {
  const parts = out.split('\0').filter(Boolean)
  const changes: GitChange[] = []
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const code = parts[i][0]
    const kind: GitChangeKind = code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified'
    changes.push({ path: parts[i + 1], kind })
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
}

/** Files that differ between a snapshot and the worktree as it is now. */
export async function changesSince(root: string, base: string): Promise<GitChange[]> {
  if (!isObjectId(base)) throw new Error('Invalid revision')
  const now = await snapshotTree(root)
  return parseNameStatus(await gitRaw(root, 'diff', '--name-status', '-z', '--no-renames', base, now))
}
