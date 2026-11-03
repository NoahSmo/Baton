import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { UsageWindow } from '../shared/types'

const run = promisify(execFile)

const WINDOWS = ['five_hour', 'seven_day'] as const

interface Credentials {
  claudeAiOauth?: { accessToken?: string; expiresAt?: number }
}

/** The login Claude Code keeps: the macOS keychain, or a file elsewhere. */
async function accessToken(): Promise<string | null> {
  let raw: string | null = null
  if (process.platform === 'darwin') {
    raw = await run('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w']).then((r) => r.stdout, () => null)
  }
  raw ??= await readFile(join(homedir(), '.claude', '.credentials.json'), 'utf8').catch(() => null)
  if (!raw) return null
  try {
    const oauth = (JSON.parse(raw) as Credentials).claudeAiOauth
    // An expired token is refreshed the next time Claude Code runs.
    if (!oauth?.accessToken || (oauth.expiresAt && oauth.expiresAt < Date.now())) return null
    return oauth.accessToken
  } catch {
    return null
  }
}

/** How much of the session and weekly windows the account has used, or null when it cannot be read. */
export async function fetchClaudeUsage(): Promise<UsageWindow[] | null> {
  const token = await accessToken()
  if (!token) return null
  try {
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: { authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' },
      signal: AbortSignal.timeout(10_000)
    })
    if (!res.ok) return null
    const body = (await res.json()) as Record<string, { utilization?: number; resets_at?: string } | null>
    return WINDOWS.flatMap((limitType) => {
      const w = body[limitType]
      if (typeof w?.utilization !== 'number') return []
      const resetsAt = w.resets_at ? Math.floor(Date.parse(w.resets_at) / 1000) : undefined
      return [{ limitType, utilization: w.utilization / 100, ...(resetsAt ? { resetsAt } : {}) }]
    })
  } catch {
    return null
  }
}
