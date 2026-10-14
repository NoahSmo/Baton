import { spawn } from 'node:child_process'
import { closeSync, existsSync, openSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { APP_NAME, BREW_CASK, GITHUB_REPO, LINUX_INSTALL_COMMAND, type UpdateInfo } from '../shared/types'
import { isNewer } from '../shared/version'

/** Latest published release, when it is newer than the running version. */
export async function checkForUpdate(
  currentVersion: string,
  fetchImpl: typeof fetch = fetch
): Promise<Pick<UpdateInfo, 'version' | 'url' | 'notes'> | null> {
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': APP_NAME }
    })
    if (!res.ok) return null
    const release = (await res.json()) as { tag_name?: string; html_url?: string; body?: string | null }
    if (!release.tag_name || !isNewer(release.tag_name, currentVersion)) return null
    return {
      version: release.tag_name.replace(/^v/i, ''),
      url: release.html_url ?? `https://github.com/${GITHUB_REPO}/releases`,
      notes: release.body ?? ''
    }
  } catch {
    // Offline or rate-limited: try again at the next check.
    return null
  }
}

/** Command that updates a copy installed by hand. */
export function manualUpdateCommand(platform: NodeJS.Platform = process.platform): string {
  return platform === 'linux' ? LINUX_INSTALL_COMMAND : `brew upgrade --cask ${BREW_CASK}`
}

/** Path of the Homebrew that installed this app, if it was installed that way. */
export function findOwningBrew(pathEnv = process.env.PATH ?? ''): string | null {
  const candidates = [...pathEnv.split(delimiter).map((dir) => join(dir, 'brew')), '/opt/homebrew/bin/brew', '/usr/local/bin/brew']
  for (const brew of candidates) {
    if (!existsSync(brew)) continue
    // <prefix>/bin/brew keeps its casks in <prefix>/Caskroom.
    if (existsSync(join(dirname(dirname(brew)), 'Caskroom', BREW_CASK.split('/').pop()!))) return brew
  }
  return null
}

/**
 * Upgrades through Homebrew in a detached process: the cask quits the app to
 * replace it, so the upgrade has to outlive us, and reopens the app at the end.
 */
export function upgradeWithBrew(brew: string, logFile: string): void {
  const log = openSync(logFile, 'a')
  const script = `"${brew}" update; "${brew}" upgrade --cask ${BREW_CASK}; open -a "${APP_NAME}"`
  spawn('/bin/sh', ['-c', script], { detached: true, stdio: ['ignore', log, log] }).unref()
  closeSync(log)
}
