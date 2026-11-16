import type { ClaudeAccount, ClaudeAccounts } from './types'

/** Accounts as stored; anything malformed is dropped, and a missing active one falls back to none (the default login). */
export function normalizeAccounts(raw: unknown, active: unknown): ClaudeAccounts {
  const list = Array.isArray(raw) ? raw : []
  const seen = new Set<string>()
  const accounts: ClaudeAccount[] = []
  for (const a of list as Partial<ClaudeAccount>[]) {
    if (typeof a?.id !== 'string' || typeof a.name !== 'string' || typeof a.configDir !== 'string') continue
    if (!a.name.trim() || !a.configDir.trim() || seen.has(a.id)) continue
    seen.add(a.id)
    accounts.push({ id: a.id, name: a.name.trim(), configDir: a.configDir.trim() })
  }
  return { accounts, activeId: typeof active === 'string' && seen.has(active) ? active : null }
}

/** `~` stands for the home folder, as in a shell. */
export function expandHome(path: string, home: string): string {
  return path === '~' || path.startsWith('~/') ? home + path.slice(1) : path
}
