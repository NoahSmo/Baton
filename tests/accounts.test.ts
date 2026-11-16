import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { copySession } from '../src/main/claudeAccount'
import { expandHome, normalizeAccounts, projectAccountKeys } from '../src/shared/accounts'

describe('normalizeAccounts', () => {
  it('keeps valid accounts and drops malformed or duplicate ones', () => {
    const raw = [{ id: 'a', name: ' Work ', configDir: '/w' }, { id: 'a', name: 'Dup', configDir: '/d' }, { id: 'b', name: '', configDir: '/x' }, null, 'x']
    expect(normalizeAccounts(raw, 'a')).toEqual({ accounts: [{ id: 'a', name: 'Work', configDir: '/w' }], activeId: 'a' })
  })

  it('falls back to the default login when the active account is gone', () => {
    expect(normalizeAccounts([{ id: 'a', name: 'A', configDir: '/a' }], 'zzz').activeId).toBeNull()
    expect(normalizeAccounts(undefined, undefined)).toEqual({ accounts: [], activeId: null })
  })
})

describe('expandHome', () => {
  it('expands a leading ~ only', () => {
    expect(expandHome('~/.claude-work', '/home/u')).toBe('/home/u/.claude-work')
    expect(expandHome('/a/~/b', '/home/u')).toBe('/a/~/b')
  })
})

describe('projectAccountKeys', () => {
  const all = ['work', 'default', 'perso']

  it('allows every account when the project is not pinned', () => {
    expect(projectAccountKeys([], all)).toEqual(all)
  })

  it('keeps the pinned accounts in preference order', () => {
    expect(projectAccountKeys(['perso', 'work'], all)).toEqual(['work', 'perso'])
  })

  it('ignores removed accounts, and falls back to all when none is left', () => {
    expect(projectAccountKeys(['gone', 'perso'], all)).toEqual(['perso'])
    expect(projectAccountKeys(['gone'], all)).toEqual(all)
  })
})

describe('copySession', () => {
  it('copies a conversation into the other account so it can be resumed', () => {
    const root = mkdtempSync(join(tmpdir(), 'baton-acc-'))
    const [from, to] = [join(root, 'a'), join(root, 'b')]
    const dir = join(from, 'projects', '-work-repo')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 's1.jsonl'), 'hello')
    expect(copySession('s1', '/work/repo', from, to)).toBe(true)
    expect(readFileSync(join(to, 'projects', '-work-repo', 's1.jsonl'), 'utf8')).toBe('hello')
  })

  it('reports a conversation it cannot find', () => {
    const root = mkdtempSync(join(tmpdir(), 'baton-acc-'))
    expect(copySession('nope', '/work/repo', join(root, 'a'), join(root, 'b'))).toBe(false)
  })
})
