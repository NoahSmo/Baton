import { execFile } from 'node:child_process'
import type { ClaudeAccountStatus } from '../shared/types'
import { claudeEnv } from './claudeAccount'

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000

/** Runs the `claude` CLI under an account's login. Through a login shell, so an app opened from Finder still finds it on PATH. */
function runClaude(args: string[], account: string, timeout: number): Promise<{ stdout: string; error: Error | null }> {
  const env = claudeEnv(account)
  const done = (error: Error | null, stdout: string) => ({ stdout, error })
  return new Promise((resolve) => {
    const callback = (error: Error | null, stdout: string) => resolve(done(error, stdout))
    if (process.platform === 'win32') execFile('claude', args, { env, timeout, shell: true }, callback)
    else execFile(process.env.SHELL || '/bin/zsh', ['-lc', `claude ${args.join(' ')}`], { env, timeout }, callback)
  })
}

/** Who an account is logged in as, per `claude auth status`. */
export async function accountStatus(account: string): Promise<ClaudeAccountStatus> {
  // The command prints its JSON even when it exits with an error for a logged-out account.
  const { stdout } = await runClaude(['auth', 'status'], account, 15_000)
  try {
    const status = JSON.parse(stdout.slice(stdout.indexOf('{'))) as { loggedIn?: boolean; email?: string }
    return { loggedIn: status.loggedIn === true, ...(status.email ? { email: status.email } : {}) }
  } catch {
    return { loggedIn: false }
  }
}

/** Has the CLI sign the account in: it opens the browser, and finishes once the user approved there. */
export async function loginAccount(account: string): Promise<ClaudeAccountStatus> {
  await runClaude(['auth', 'login'], account, LOGIN_TIMEOUT_MS)
  return accountStatus(account)
}
