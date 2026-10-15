import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  gitDirOf,
  gitStatus,
  hasLanded,
  isTrunkRef,
  lastGitActivity,
  listBranches,
  parseStatus,
  parseWorktrees,
  strayWorktrees,
  switchBranch
} from '../src/main/git'

describe('parseStatus', () => {
  it('reads the branch, its upstream and how far apart they are', () => {
    const out = ['# branch.oid 0123456789abcdef', '# branch.head feat/x', '# branch.upstream origin/feat/x', '# branch.ab +2 -1', ''].join('\0')
    expect(parseStatus(out)).toEqual({ branch: 'feat/x', head: '0123456', upstream: 'origin/feat/x', ahead: 2, behind: 1, changes: [] })
  })

  it('reports a detached HEAD as no branch', () => {
    expect(parseStatus('# branch.oid 0123456789abcdef\0# branch.head (detached)\0').branch).toBeNull()
  })

  it('classifies changes, paths with spaces and renames included', () => {
    const out = [
      '1 .M N... 100644 100644 100644 aaa bbb src/my file.ts',
      '1 A. N... 000000 100644 100644 aaa bbb src/new.ts',
      '1 .D N... 100644 100644 000000 aaa bbb gone.ts',
      '2 R. N... 100644 100644 100644 aaa bbb R100 after.ts',
      'before.ts',
      'u UU N... 100644 100644 100644 100644 aaa bbb ccc clash.ts',
      '? notes.txt',
      ''
    ].join('\0')
    expect(parseStatus(out).changes).toEqual([
      { path: 'after.ts', kind: 'renamed' },
      { path: 'clash.ts', kind: 'conflicted' },
      { path: 'gone.ts', kind: 'deleted' },
      { path: 'notes.txt', kind: 'untracked' },
      { path: 'src/my file.ts', kind: 'modified' },
      { path: 'src/new.ts', kind: 'added' }
    ])
  })
})

describe('parseWorktrees', () => {
  it('pairs each worktree with its branch', () => {
    const out = 'worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /wt/a\nHEAD def\nbranch refs/heads/feat/a\n\nworktree /wt/b\nHEAD 123\ndetached\n'
    expect(parseWorktrees(out)).toEqual([
      { path: '/repo', branch: 'main' },
      { path: '/wt/a', branch: 'feat/a' },
      { path: '/wt/b', branch: null }
    ])
  })
})

describe('in a repository', () => {
  let base: string
  let repo: string
  let worktree: string

  const run = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, stdio: 'pipe' })

  beforeAll(() => {
    // Git words its errors in the system language; the assertions expect English.
    process.env.LC_ALL = 'C'
    base = realpathSync(mkdtempSync(join(tmpdir(), 'baton-git-')))
    repo = join(base, 'repo')
    worktree = join(base, 'worktree')
    mkdirSync(repo)
    run(repo, 'init', '-b', 'main')
    writeFileSync(join(repo, 'a.txt'), 'one\n')
    run(repo, 'add', '.')
    run(repo, 'commit', '-m', 'first')
    run(repo, 'branch', 'spare')
    run(repo, 'worktree', 'add', '-b', 'feat/x', worktree)
  })

  afterAll(() => rmSync(base, { recursive: true, force: true }))

  it('reports the status of a worktree', async () => {
    writeFileSync(join(worktree, 'a.txt'), 'two\n')
    writeFileSync(join(worktree, 'b.txt'), 'new\n')
    expect(await gitStatus(worktree)).toMatchObject({
      branch: 'feat/x',
      upstream: null,
      changes: [
        { path: 'a.txt', kind: 'modified' },
        { path: 'b.txt', kind: 'untracked' }
      ]
    })
    run(worktree, 'checkout', '--', 'a.txt')
  })

  it('lists branches and where the taken ones are checked out', async () => {
    const byName = Object.fromEntries((await listBranches(worktree)).map((b) => [b.name, b]))
    expect(byName['feat/x']).toMatchObject({ current: true, heldBy: null })
    expect(byName.main).toMatchObject({ current: false, heldBy: repo })
    expect(byName.spare).toMatchObject({ current: false, remote: false, heldBy: null })
  })

  it('switches to a free branch only', async () => {
    await expect(switchBranch(worktree, 'main')).rejects.toThrow('Cannot switch')
    await expect(switchBranch(worktree, '--orphan')).rejects.toThrow('Cannot switch')
    await switchBranch(worktree, 'spare')
    expect((await gitStatus(worktree)).branch).toBe('spare')
  })

  it("passes on git's explanation when a switch is refused", async () => {
    run(worktree, 'switch', 'feat/x')
    writeFileSync(join(worktree, 'a.txt'), 'theirs\n')
    run(worktree, 'commit', '-am', 'diverge')
    run(worktree, 'switch', 'spare')
    writeFileSync(join(worktree, 'a.txt'), 'mine\n')
    await expect(switchBranch(worktree, 'feat/x')).rejects.toThrow(/local changes/)
    run(worktree, 'checkout', '--', 'a.txt')
  })

  it('finds where git keeps the state of a clone and of a linked worktree', () => {
    expect(gitDirOf(repo)).toBe(join(repo, '.git'))
    expect(gitDirOf(worktree)).toBe(join(repo, '.git', 'worktrees', 'worktree'))
    expect(gitDirOf(base)).toBeNull()
  })

  it('tells when git last wrote to a worktree', () => {
    expect(lastGitActivity(worktree)).toBeGreaterThan(Date.now() - 60_000)
    expect(lastGitActivity(base)).toBe(0)
  })

  it('finds the worktrees under a folder that nobody answers for', async () => {
    const root = join(base, 'worktrees')
    const mine = join(root, 'mine')
    const stray = join(root, 'stray')
    run(repo, 'worktree', 'add', '-b', 'feat/mine', mine)
    run(repo, 'worktree', 'add', '-b', 'fix/stray', stray)
    expect(await strayWorktrees(repo, root, new Set([mine]))).toEqual([{ path: stray, branch: 'fix/stray' }])
    expect(await strayWorktrees(repo, root, new Set([mine, stray]))).toEqual([])
  })
})

describe('isTrunkRef', () => {
  it('knows the trunks of a remote, its default branch included', () => {
    expect(isTrunkRef('refs/remotes/origin/main')).toBe(true)
    expect(isTrunkRef('refs/remotes/origin/dev')).toBe(true)
    expect(isTrunkRef('refs/remotes/origin/HEAD')).toBe(true)
    expect(isTrunkRef('refs/remotes/origin/feat/main')).toBe(false)
    expect(isTrunkRef('refs/remotes/origin/feat/x')).toBe(false)
  })
})

describe('hasLanded', () => {
  let base: string
  let repo: string
  let worktree: string

  const run = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, stdio: 'pipe' })

  beforeAll(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'baton-landed-')))
    repo = join(base, 'repo')
    worktree = join(base, 'worktree')
    run(base, 'init', '--bare', '-b', 'main', 'origin.git')
    mkdirSync(repo)
    run(repo, 'init', '-b', 'main')
    run(repo, 'remote', 'add', 'origin', join(base, 'origin.git'))
    writeFileSync(join(repo, 'a.txt'), 'one\n')
    run(repo, 'add', '.')
    run(repo, 'commit', '-m', 'first')
    run(repo, 'push', 'origin', 'main')
    run(repo, 'worktree', 'add', '-b', 'feat/x', worktree)
  })

  afterAll(() => rmSync(base, { recursive: true, force: true }))

  it('leaves alone a branch nothing was committed on', async () => {
    expect(await hasLanded(worktree)).toBe(false)
  })

  it('waits for the commits to reach a trunk', async () => {
    writeFileSync(join(worktree, 'a.txt'), 'two\n')
    run(worktree, 'commit', '-am', 'second')
    run(worktree, 'push', 'origin', 'feat/x')
    expect(await hasLanded(worktree)).toBe(false)
    run(worktree, 'push', 'origin', 'feat/x:main')
    expect(await hasLanded(worktree)).toBe(true)
  })

  it('keeps a worktree with uncommitted changes, untracked files included', async () => {
    writeFileSync(join(worktree, 'notes.txt'), 'draft\n')
    expect(await hasLanded(worktree)).toBe(false)
  })

  it('never takes a trunk itself for a merged branch', async () => {
    expect(await hasLanded(repo)).toBe(false)
  })
})
