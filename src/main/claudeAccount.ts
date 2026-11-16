import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ClaudeAccount } from '../shared/types'
import { DEFAULT_ACCOUNT } from '../shared/accounts'

let accounts: ClaudeAccount[] = []
/** The account tried first; DEFAULT_ACCOUNT is the Claude Code default login (~/.claude). */
let activeKey: string = DEFAULT_ACCOUNT

export function setAccounts(list: ClaudeAccount[], active: string | null): void {
  accounts = list
  activeKey = active ?? DEFAULT_ACCOUNT
}

export function getActiveKey(): string {
  return activeKey
}

/** Every account an agent can run under, the preferred one first. */
export function accountKeys(): string[] {
  const all = [DEFAULT_ACCOUNT, ...accounts.map((a) => a.id)]
  return [activeKey, ...all.filter((k) => k !== activeKey)]
}

/** Name of an account; null for the default login. */
export function accountName(key: string | null | undefined): string | null {
  return accounts.find((a) => a.id === key)?.name ?? null
}

/** Config folder of an account; null is the Claude Code default or an account that was removed. */
export function configDirOf(key: string | null | undefined): string | null {
  return accounts.find((a) => a.id === key)?.configDir ?? null
}

/** Folder of the preferred login; null is the Claude Code default (~/.claude). */
export function getActiveConfigDir(): string | null {
  return configDirOf(activeKey)
}

/** Environment for a Claude Code process: the account's config folder on top of ours. */
export function claudeEnv(key: string | null | undefined = activeKey): NodeJS.ProcessEnv {
  const dir = configDirOf(key)
  return dir ? { ...process.env, CLAUDE_CONFIG_DIR: dir } : { ...process.env }
}

/** Keychain entry Claude Code files a login under: a custom config folder gets its own, named after a hash of the path. */
export function keychainService(configDir: string | null): string {
  if (!configDir) return 'Claude Code-credentials'
  return `Claude Code-credentials-${createHash('sha256').update(configDir).digest('hex').slice(0, 8)}`
}

/**
 * Copies a conversation from one account's config folder to another's so the
 * second account can resume it. False when the source cannot be found.
 */
export function copySession(sessionId: string, cwd: string, from: string | null, to: string | null): boolean {
  const projectDir = cwd.replace(/[^a-zA-Z0-9]/g, '-')
  const root = (dir: string | null) => join(dir ?? join(homedir(), '.claude'), 'projects', projectDir)
  const source = root(from)
  const target = root(to)
  if (source === target) return true
  const file = join(source, `${sessionId}.jsonl`)
  if (!existsSync(file)) return false
  try {
    mkdirSync(target, { recursive: true })
    cpSync(file, join(target, `${sessionId}.jsonl`), { force: true })
    // Sub-agent transcripts live in a folder named after the session.
    if (existsSync(join(source, sessionId))) cpSync(join(source, sessionId), join(target, sessionId), { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}
