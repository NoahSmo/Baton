import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { abortMerge, checkConflicts, finishMerge, hasMarkers, parseMergeTree } from '../src/main/conflicts'
import { gitStatus } from '../src/main/git'

describe('hasMarkers', () => {
  it('spots the markers git leaves, and only a full set', () => {
    expect(hasMarkers('a\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> main\n')).toBe(true)
    expect(hasMarkers('Title\n=======\ntext\n')).toBe(false)
  })
})

describe('parseMergeTree', () => {
  it('keeps the file names between the tree id and the first blank line', () => {
    expect(parseMergeTree('abc123\na.txt\nsrc/b.ts\n\nAuto-merging a.txt\n')).toEqual(['a.txt', 'src/b.ts'])
  })
})

describe('with a remote that moved on', () => {
  let base: string
  let clone: string
  const run = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, stdio: 'pipe' }).toString()

  beforeAll(() => {
    process.env.LC_ALL = 'C'
    base = realpathSync(mkdtempSync(join(tmpdir(), 'baton-conflicts-')))
    const origin = join(base, 'origin.git')
    const other = join(base, 'other')
    clone = join(base, 'clone')
    run(base, 'init', '--bare', '-b', 'main', origin)
    run(base, 'clone', origin, other)
    writeFileSync(join(other, 'a.txt'), 'one\n')
    writeFileSync(join(other, 'b.txt'), 'keep\n')
    run(other, 'add', '.')
    run(other, 'commit', '-m', 'first')
    run(other, 'push', 'origin', 'main')
    run(base, 'clone', origin, clone)
    // finishMerge commits through the app's own git calls, which carry no identity: CI has none configured.
    run(clone, 'config', 'user.name', 'Test')
    run(clone, 'config', 'user.email', 'test@example.com')
    run(clone, 'switch', '-c', 'feat/x')
    writeFileSync(join(clone, 'a.txt'), 'mine\n')
    run(clone, 'commit', '-am', 'mine')
    run(clone, 'push', '--set-upstream', 'origin', 'feat/x')
    writeFileSync(join(other, 'a.txt'), 'theirs\n')
    run(other, 'commit', '-am', 'theirs')
    run(other, 'push', 'origin', 'main')
  })

  afterAll(() => rmSync(base, { recursive: true, force: true }))

  it('names the trunk and the files that would conflict, leaving the worktree alone', async () => {
    expect(await checkConflicts(clone)).toEqual({ target: 'origin/main', files: ['a.txt'] })
    expect(await gitStatus(clone)).toMatchObject({ changes: [] })
  })

  it('commits an open merge with the edits of the user, and refuses markers', async () => {
    try {
      run(clone, 'merge', '--no-commit', '--no-ff', 'origin/main')
    } catch {
      // Conflicts exit 1: the merge is open, as wanted.
    }
    await expect(finishMerge(clone, [{ path: 'a.txt', content: '<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> main\n' }])).rejects.toThrow('markers')
    await finishMerge(clone, [{ path: 'a.txt', content: 'both\n' }])
    expect(readFileSync(join(clone, 'a.txt'), 'utf8')).toBe('both\n')
    expect(run(clone, 'log', '-1', '--format=%p').trim().split(' ')).toHaveLength(2)
    expect(await checkConflicts(clone)).toBeNull()
  })

  it('puts the branch back when the merge is aborted', async () => {
    run(clone, 'reset', '--hard', 'HEAD~1')
    try {
      run(clone, 'merge', '--no-commit', '--no-ff', 'origin/main')
    } catch {
      // Open on conflicts.
    }
    await abortMerge(clone)
    expect(readFileSync(join(clone, 'a.txt'), 'utf8')).toBe('mine\n')
  })
})
