import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { accessSync, closeSync, constants, createWriteStream, existsSync, mkdirSync, openSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  APP_NAME,
  APP_SLUG,
  BREW_CASK,
  GITHUB_REPO,
  LINUX_INSTALL_COMMAND,
  type UpdateAsset,
  type UpdateInfo,
  type UpdateInstallMode,
  type UpdateProgress
} from '../shared/types'
import { isNewer } from '../shared/version'

export type ReleaseAsset = UpdateAsset

/** Latest published release, when it is newer than the running version. */
export async function checkForUpdate(
  currentVersion: string,
  fetchImpl: typeof fetch = fetch
): Promise<(Pick<UpdateInfo, 'version' | 'url' | 'notes'> & { assets: ReleaseAsset[] }) | null> {
  try {
    const res = await fetchImpl(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': APP_NAME }
    })
    if (!res.ok) return null
    const release = (await res.json()) as {
      tag_name?: string
      html_url?: string
      body?: string | null
      assets?: { name?: string; browser_download_url?: string; digest?: string | null }[]
    }
    if (!release.tag_name || !isNewer(release.tag_name, currentVersion)) return null
    return {
      version: release.tag_name.replace(/^v/i, ''),
      url: release.html_url ?? `https://github.com/${GITHUB_REPO}/releases`,
      notes: release.body ?? '',
      assets: (release.assets ?? []).flatMap((a) =>
        a.name && a.browser_download_url
          ? [{ name: a.name, url: a.browser_download_url, sha256: a.digest?.replace(/^sha256:/, '') }]
          : []
      )
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

/** Package names as `scripts/release.mjs` publishes them. */
export function pickAsset(
  assets: ReleaseAsset[],
  version: string,
  mode: UpdateInstallMode,
  arch: string = process.arch,
  packager: 'deb' | 'rpm' = 'deb'
): ReleaseAsset | null {
  let name: string | null = null
  if (mode === 'mac-zip') name = arch === 'arm64' ? `${APP_NAME}-${version}.zip` : null
  else if (mode === 'linux-user') name = `${APP_NAME}-${version}-linux-${arch === 'arm64' ? 'arm64' : 'x64'}.tar.gz`
  else if (mode === 'linux-pkg') {
    name =
      packager === 'deb'
        ? `${APP_NAME}-${version}-linux-${arch === 'arm64' ? 'arm64' : 'amd64'}.deb`
        : `${APP_NAME}-${version}-linux-${arch === 'arm64' ? 'aarch64' : 'x86_64'}.rpm`
  }
  return (name && assets.find((a) => a.name === name)) || null
}

export interface InstallEnv {
  platform: NodeJS.Platform
  execPath: string
  home: string
  brew: string | null
  /** Whether a directory can be written to. */
  writable(dir: string): boolean
  /** Whether a program is on the PATH. */
  has(program: string): boolean
}

export function currentEnv(pathEnv = process.env.PATH ?? ''): InstallEnv {
  return {
    platform: process.platform,
    execPath: process.execPath,
    home: homedir(),
    brew: findOwningBrew(pathEnv),
    writable: (dir) => {
      try {
        accessSync(dir, constants.W_OK)
        return true
      } catch {
        return false
      }
    },
    has: (program) => pathEnv.split(delimiter).some((dir) => existsSync(join(dir, program)))
  }
}

/** Bundle of the running macOS app: <name>.app/Contents/MacOS/<exe>. */
export function macAppPath(execPath: string): string {
  return dirname(dirname(dirname(execPath)))
}

/** How this copy of the app can update itself. */
export function detectInstallMode(env: InstallEnv): { mode: UpdateInstallMode; packager: 'deb' | 'rpm' } {
  const none = { mode: 'manual' as const, packager: 'deb' as const }
  if (env.platform === 'darwin') {
    if (env.brew) return { mode: 'brew', packager: 'deb' }
    const app = macAppPath(env.execPath)
    return app.endsWith('.app') && env.writable(dirname(app)) && env.writable(app)
      ? { mode: 'mac-zip', packager: 'deb' }
      : none
  }
  if (env.platform === 'linux') {
    if (env.execPath.startsWith(join(env.home, '.local', 'share', APP_SLUG))) return { mode: 'linux-user', packager: 'deb' }
    if (/^\/(usr|opt)\//.test(env.execPath) && env.has('pkexec')) {
      if (env.has('apt-get')) return { mode: 'linux-pkg', packager: 'deb' }
      if (env.has('dnf')) return { mode: 'linux-pkg', packager: 'rpm' }
    }
  }
  return none
}

/** Downloads a release package, checking its checksum when GitHub gives one. */
export async function downloadAsset(
  asset: ReleaseAsset,
  dir: string,
  onProgress: (progress: UpdateProgress) => void,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, asset.name)
  try {
    const res = await fetchImpl(asset.url, { headers: { 'User-Agent': APP_NAME } })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
    const total = Number(res.headers.get('content-length')) || undefined
    const hash = createHash('sha256')
    let received = 0
    const body = Readable.fromWeb(res.body as never)
    body.on('data', (chunk: Buffer) => {
      hash.update(chunk)
      received += chunk.length
      onProgress({ phase: 'downloading', received, total })
    })
    await pipeline(body, createWriteStream(file))
    if (asset.sha256 && hash.digest('hex') !== asset.sha256.toLowerCase()) throw new Error('checksum mismatch')
    return file
  } catch (err) {
    rmSync(file, { force: true })
    throw err
  }
}

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

/** Shell script that waits for this process to exit, installs, then reopens the app. */
export function installScript(mode: UpdateInstallMode, file: string, env: InstallEnv, packager: 'deb' | 'rpm'): string {
  const wait = `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.5; done`
  if (mode === 'mac-zip') {
    const app = macAppPath(env.execPath)
    const stage = `${dirname(file)}/stage`
    return [
      wait,
      'set -e',
      `rm -rf ${quote(stage)}; mkdir -p ${quote(stage)}`,
      `/usr/bin/ditto -x -k ${quote(file)} ${quote(stage)}`,
      `rm -rf ${quote(`${app}.old`)}; mv ${quote(app)} ${quote(`${app}.old`)}`,
      `mv ${quote(`${stage}/${APP_NAME}.app`)} ${quote(app)} || { mv ${quote(`${app}.old`)} ${quote(app)}; exit 1; }`,
      `rm -rf ${quote(`${app}.old`)}`,
      `xattr -dr com.apple.quarantine ${quote(app)} || true`,
      `open ${quote(app)}`
    ].join('\n')
  }
  if (mode === 'linux-user') {
    const dest = join(env.home, '.local', 'share', APP_SLUG)
    return [
      wait,
      'set -e',
      `tar -xzf ${quote(file)} -C ${quote(dest)} --strip-components=1`,
      `nohup ${quote(join(dest, APP_SLUG))} >/dev/null 2>&1 &`
    ].join('\n')
  }
  const install = packager === 'deb' ? `pkexec apt-get install -y ${quote(file)}` : `pkexec dnf install -y ${quote(file)}`
  return [wait, 'set -e', install, `nohup ${APP_SLUG} >/dev/null 2>&1 &`].join('\n')
}

/** Runs the install script detached: it outlives the app it replaces. */
export function runDetached(script: string, logFile: string): void {
  const log = openSync(logFile, 'a')
  spawn('/bin/sh', ['-c', script], { detached: true, stdio: ['ignore', log, log] }).unref()
  closeSync(log)
}

export const updateDir = (version: string) => join(tmpdir(), `${APP_SLUG}-update-${version}`)
