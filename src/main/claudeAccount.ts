import { createHash } from 'node:crypto'

/** Folder of the login agents run under; null is the Claude Code default (~/.claude). */
let activeConfigDir: string | null = null

export function setActiveConfigDir(dir: string | null): void {
  activeConfigDir = dir
}

export function getActiveConfigDir(): string | null {
  return activeConfigDir
}

/** Environment for a Claude Code process: the active account's config folder on top of ours. */
export function claudeEnv(): NodeJS.ProcessEnv {
  return activeConfigDir ? { ...process.env, CLAUDE_CONFIG_DIR: activeConfigDir } : { ...process.env }
}

/** Keychain entry Claude Code files a login under: a custom config folder gets its own, named after a hash of the path. */
export function keychainService(configDir: string | null): string {
  if (!configDir) return 'Claude Code-credentials'
  return `Claude Code-credentials-${createHash('sha256').update(configDir).digest('hex').slice(0, 8)}`
}
