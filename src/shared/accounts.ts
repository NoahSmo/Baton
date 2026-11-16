import type { ClaudeAccount, ClaudeAccounts } from './types'

/** Key of the Claude Code default login (~/.claude) among the accounts an agent can run under. */
export const DEFAULT_ACCOUNT = 'default'

/** The accounts a project may use, among those that exist; empty when it is not restricted. */
export function projectAccountKeys(allowed: string[], all: string[]): string[] {
  const known = allowed.filter((k) => all.includes(k))
  return known.length ? all.filter((k) => known.includes(k)) : all
}

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
