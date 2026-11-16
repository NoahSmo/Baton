import { describe, expect, it } from 'vitest'
import { expandHome, normalizeAccounts } from '../src/shared/accounts'

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
