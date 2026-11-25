import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createWorktree } from '../src/main/worktree'

const run = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

describe('createWorktree with a branch to pull', () => {
  let dir: string
  let repo: string
  let other: string

  beforeAll(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'baton-wt-')))
    const remote = join(dir, 'remote.git')
    repo = join(dir, 'repo')
    other = join(dir, 'other')
    run(dir, 'init', '--bare', '-b', 'main', remote)
    for (const d of [repo, other]) {
      run(dir, 'clone', '-q', remote, d)
      run(d, 'config', 'user.email', 't@t')
      run(d, 'config', 'user.name', 't')
    }
    writeFileSync(join(repo, 'a.txt'), '1')
    run(repo, 'add', '.')
    run(repo, 'commit', '-qm', 'one')
    run(repo, 'push', '-q', 'origin', 'main')
    run(repo, 'push', '-q', 'origin', 'main:dev')
    run(repo, 'fetch', '-q')
    run(repo, 'branch', 'dev', 'origin/dev')
    // Another clone moves dev forward.
    run(other, 'pull', '-q', 'origin', 'dev')
    run(other, 'checkout', '-q', 'dev')
    writeFileSync(join(other, 'b.txt'), '2')
    run(other, 'add', '.')
    run(other, 'commit', '-qm', 'two')
    run(other, 'push', '-q', 'origin', 'dev')
  })

  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('updates a branch that is not checked out and starts the worktree from it', async () => {
    const wt = await createWorktree(repo, join(dir, 'wts'), 'x', undefined, undefined, 'dev')
    expect(existsSync(join(wt.path, 'b.txt'))).toBe(true)
    expect(run(repo, 'branch', '--show-current')).toBe('main')
  })
})
