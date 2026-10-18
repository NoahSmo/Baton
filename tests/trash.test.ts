import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { changesSince, headContent, parseNameStatus, snapshotTree } from '../src/main/git'
import { conversationText, parseSummary } from '../src/main/handoff'
import { parseDraft } from '../src/main/pullRequest'
import { applyChanges, captureChanges, listTrash, readMeta, saveToTrash } from '../src/main/trash'
import { addWorktreeOnBranch } from '../src/main/worktree'
import type { Feature, StoredEvent } from '../src/shared/types'

const run = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, stdio: 'pipe' }).toString().trim()

describe('with a worktree holding uncommitted work', () => {
  let base: string
  let repo: string
  let worktree: string
  let trash: string
  let feature: Feature

  beforeAll(() => {
    process.env.LC_ALL = 'C'
    base = realpathSync(mkdtempSync(join(tmpdir(), 'baton-trash-')))
    repo = join(base, 'repo')
    worktree = join(base, 'wt')
    trash = join(base, 'trash')
    mkdirSync(repo)
    run(repo, 'init', '-b', 'main')
    writeFileSync(join(repo, 'a.txt'), 'one\n')
    writeFileSync(join(repo, 'gone.txt'), 'bye\n')
    run(repo, 'add', '.')
    run(repo, 'commit', '-m', 'first')
    run(repo, 'worktree', 'add', '-b', 'feat/x', worktree)
    feature = { id: 'feat-1', projectId: 'p', title: 'Dark mode', branch: 'feat/x', worktreePath: worktree } as Feature
  })

  afterAll(() => rmSync(base, { recursive: true, force: true }))

  it('snapshots without touching the index or the history', async () => {
    const before = run(worktree, 'status', '--porcelain=v2')
    const head = run(worktree, 'rev-parse', 'HEAD')
    writeFileSync(join(worktree, 'a.txt'), 'two\n')
    writeFileSync(join(worktree, 'new.txt'), 'fresh\n')
    const tree = await snapshotTree(worktree)
    expect(tree).toMatch(/^[0-9a-f]{40,64}$/)
    expect(run(worktree, 'rev-parse', 'HEAD')).toBe(head)
    // Nothing was staged: the status reads as it would have without the snapshot.
    expect(run(worktree, 'status', '--porcelain=v2')).not.toBe(before)
    expect(run(worktree, 'diff', '--cached', '--name-only')).toBe('')
    run(worktree, 'checkout', '--', 'a.txt')
    rmSync(join(worktree, 'new.txt'))
  })

  it('lists what changed since a snapshot, new and deleted files included', async () => {
    const base = await snapshotTree(worktree)
    expect(await changesSince(worktree, base)).toEqual([])
    writeFileSync(join(worktree, 'a.txt'), 'three\n')
    writeFileSync(join(worktree, 'added.txt'), 'x\n')
    rmSync(join(worktree, 'gone.txt'))
    expect(await changesSince(worktree, base)).toEqual([
      { path: 'a.txt', kind: 'modified' },
      { path: 'added.txt', kind: 'added' },
      { path: 'gone.txt', kind: 'deleted' }
    ])
    // The file as the turn found it, for the diff.
    expect(await headContent(worktree, 'a.txt', base)).toBe('one\n')
    expect(await headContent(worktree, 'added.txt', base)).toBeNull()
    await expect(changesSince(worktree, 'HEAD; rm -rf /')).rejects.toThrow('Invalid revision')
    await expect(headContent(worktree, 'a.txt', 'refs/heads/main')).rejects.toThrow('Invalid revision')
    run(worktree, 'checkout', '--', '.')
    rmSync(join(worktree, 'added.txt'))
  })

  it('keeps nothing for a clean worktree', async () => {
    expect(await saveToTrash(trash, feature, 'Repo')).toBeNull()
    expect(existsSync(join(trash, feature.id))).toBe(false)
  })

  it('keeps modified, deleted and untracked files, then puts them back on a fresh worktree', async () => {
    writeFileSync(join(worktree, 'a.txt'), 'edited\n')
    rmSync(join(worktree, 'gone.txt'))
    mkdirSync(join(worktree, 'deep/dir'), { recursive: true })
    writeFileSync(join(worktree, 'deep/dir/new.txt'), 'brand new\n')

    const entry = await saveToTrash(trash, feature, 'Repo')
    expect(entry).toMatchObject({ id: 'feat-1', title: 'Dark mode', branch: 'feat/x', projectName: 'Repo', files: 3 })
    expect(entry).not.toHaveProperty('head')
    expect((await listTrash(trash)).map((e) => e.id)).toEqual(['feat-1'])

    run(repo, 'worktree', 'remove', '--force', worktree)
    const meta = (await readMeta(trash, 'feat-1'))!
    const restored = await addWorktreeOnBranch(repo, join(base, 'again'), 'dark-mode', meta.branch, meta.head)
    expect(restored.branch).toBe('feat/x')
    await applyChanges(join(trash, 'feat-1'), restored.path)
    expect(readFileSync(join(restored.path, 'a.txt'), 'utf8')).toBe('edited\n')
    expect(existsSync(join(restored.path, 'gone.txt'))).toBe(false)
    expect(readFileSync(join(restored.path, 'deep/dir/new.txt'), 'utf8')).toBe('brand new\n')
  })

  it('recreates a branch that was deleted meanwhile', async () => {
    const head = run(repo, 'rev-parse', 'HEAD')
    const out = await addWorktreeOnBranch(repo, join(base, 'again'), 'lost', 'feat/lost', head)
    expect(out.branch).toBe('feat/lost')
    expect(run(out.path, 'branch', '--show-current')).toBe('feat/lost')
  })

  it('captures nothing when there is nothing to capture', async () => {
    expect(await captureChanges(repo, join(base, 'empty'))).toBe(0)
  })

  it('forgets entries after a week, and refuses ids that are paths', async () => {
    const old = Date.now() + 8 * 24 * 60 * 60 * 1000
    expect(await listTrash(trash, old)).toEqual([])
    expect(existsSync(join(trash, 'feat-1'))).toBe(false)
    expect(await readMeta(trash, '../etc')).toBeNull()
  })
})

describe('parseNameStatus', () => {
  it('reads added, modified and deleted files, in path order', () => {
    expect(parseNameStatus('M\0b.ts\0A\0a dir/x.ts\0D\0c.ts\0')).toEqual([
      { path: 'a dir/x.ts', kind: 'added' },
      { path: 'b.ts', kind: 'modified' },
      { path: 'c.ts', kind: 'deleted' }
    ])
    expect(parseNameStatus('')).toEqual([])
  })
})

describe('parseDraft', () => {
  it('keeps a one-line title and a clean body', () => {
    expect(parseDraft({ title: 'Add dark mode\nignored', body: '```md\n- done\n```' }, 'main')).toEqual({
      title: 'Add dark mode',
      body: '- done',
      base: 'main'
    })
  })

  it('survives an answer that is not one', () => {
    expect(parseDraft(null, 'dev')).toEqual({ title: '', body: '', base: 'dev' })
    expect(parseDraft({ title: 3, body: [] }, 'dev')).toEqual({ title: '', body: '', base: 'dev' })
  })
})

describe('handoff', () => {
  const at = (seq: number, event: StoredEvent['event']): StoredEvent => ({ seq, featureId: 'f', at: seq, event })

  it('writes the conversation without the tool noise, cutting the oldest part when it is long', () => {
    const events = [
      at(1, { kind: 'user', text: 'Add dark mode' }),
      at(2, { kind: 'tool_use', toolUseId: 't', name: 'Edit', input: { big: 'x'.repeat(100) } }),
      at(3, { kind: 'tool_result', toolUseId: 't', content: 'y'.repeat(100), isError: false }),
      at(4, { kind: 'assistant_text', text: 'Done.' })
    ]
    expect(conversationText(events)).toBe('User: Add dark mode\n\n(agent used Edit)\n\nAgent: Done.')
    const long = [at(1, { kind: 'user', text: 'OLD' + 'z'.repeat(50_000) }), at(2, { kind: 'assistant_text', text: 'END' })]
    const text = conversationText(long)
    expect(text.startsWith('… (earlier part left out)')).toBe(true)
    expect(text.endsWith('END')).toBe(true)
    expect(text).not.toContain('OLD')
  })

  it('reads the summary of an answer', () => {
    expect(parseSummary({ summary: '```\nGoal: x\n```' })).toBe('Goal: x')
    expect(parseSummary(undefined)).toBe('')
  })
})
