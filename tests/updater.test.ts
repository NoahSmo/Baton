import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brewScript, checkForUpdate, detectInstallMode, downloadAsset, installScript, pickAsset, type InstallEnv } from '../src/main/updater'
import { isNewer } from '../src/shared/version'

describe('isNewer', () => {
  it('compares numerically, not as text', () => {
    expect(isNewer('0.10.0', '0.9.5')).toBe(true)
    expect(isNewer('1.0.0', '0.99.99')).toBe(true)
    expect(isNewer('0.2.1', '0.2.0')).toBe(true)
  })

  it('is false for the same or an older version', () => {
    expect(isNewer('0.2.0', '0.2.0')).toBe(false)
    expect(isNewer('v0.2.0', '0.2.0')).toBe(false)
    expect(isNewer('0.1.9', '0.2.0')).toBe(false)
  })

  it('tolerates tags, short versions and pre-release suffixes', () => {
    expect(isNewer('v1.2', '1.1.9')).toBe(true)
    expect(isNewer('1.2.0-beta.1', '1.2.0')).toBe(false)
    expect(isNewer('garbage', '0.0.1')).toBe(false)
  })
})

const github = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('checkForUpdate', () => {
  const release = { tag_name: 'v0.3.0', html_url: 'https://example.test/v0.3.0', body: 'Notes' }

  it('reports a newer release', async () => {
    expect(await checkForUpdate('0.2.0', github(200, release))).toEqual({
      version: '0.3.0',
      url: 'https://example.test/v0.3.0',
      notes: 'Notes',
      assets: []
    })
  })

  it('lists the packages with their checksum', async () => {
    const withAssets = {
      ...release,
      assets: [{ name: 'Baton-0.3.0.zip', browser_download_url: 'https://example.test/a.zip', digest: 'sha256:abc' }]
    }
    const found = await checkForUpdate('0.2.0', github(200, withAssets))
    expect(found?.assets).toEqual([{ name: 'Baton-0.3.0.zip', url: 'https://example.test/a.zip', sha256: 'abc' }])
  })

  it('stays quiet when up to date', async () => {
    expect(await checkForUpdate('0.3.0', github(200, release))).toBeNull()
    expect(await checkForUpdate('0.4.0', github(200, release))).toBeNull()
  })

  it('stays quiet when GitHub cannot be reached or answers with an error', async () => {
    expect(await checkForUpdate('0.1.0', github(403, { message: 'rate limited' }))).toBeNull()
    const offline = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await checkForUpdate('0.1.0', offline)).toBeNull()
  })
})

describe('pickAsset', () => {
  const names = [
    'Baton-0.3.0.zip',
    'Baton-0.3.0-linux-x64.tar.gz',
    'Baton-0.3.0-linux-arm64.tar.gz',
    'Baton-0.3.0-linux-amd64.deb',
    'Baton-0.3.0-linux-arm64.deb',
    'Baton-0.3.0-linux-x86_64.rpm',
    'Baton-0.3.0-linux-aarch64.rpm'
  ]
  const assets = names.map((name) => ({ name, url: `https://example.test/${name}` }))
  const pick = (...args: Parameters<typeof pickAsset> extends [unknown, ...infer R] ? R : never) =>
    pickAsset(assets, ...args)?.name

  it('finds the package of each install mode', () => {
    expect(pick('0.3.0', 'mac-zip', 'arm64')).toBe('Baton-0.3.0.zip')
    expect(pick('0.3.0', 'linux-user', 'x64')).toBe('Baton-0.3.0-linux-x64.tar.gz')
    expect(pick('0.3.0', 'linux-pkg', 'arm64', 'deb')).toBe('Baton-0.3.0-linux-arm64.deb')
    expect(pick('0.3.0', 'linux-pkg', 'x64', 'rpm')).toBe('Baton-0.3.0-linux-x86_64.rpm')
  })

  it('finds nothing when the release lacks it', () => {
    expect(pick('0.4.0', 'mac-zip', 'arm64')).toBeUndefined()
    expect(pick('0.3.0', 'mac-zip', 'x64')).toBeUndefined()
    expect(pick('0.3.0', 'brew', 'arm64')).toBeUndefined()
  })
})

describe('detectInstallMode', () => {
  const env = (over: Partial<InstallEnv>): InstallEnv => ({
    platform: 'darwin',
    execPath: '/Applications/Baton.app/Contents/MacOS/Baton',
    home: '/home/me',
    brew: null,
    writable: () => true,
    has: () => true,
    ...over
  })

  it('prefers Homebrew on macOS', () => {
    expect(detectInstallMode(env({ brew: '/opt/homebrew/bin/brew' })).mode).toBe('brew')
  })

  it('replaces the app bundle when it can be written', () => {
    expect(detectInstallMode(env({})).mode).toBe('mac-zip')
    expect(detectInstallMode(env({ writable: () => false })).mode).toBe('manual')
    expect(detectInstallMode(env({ execPath: '/tmp/electron' })).mode).toBe('manual')
  })

  it('tells the Linux install kinds apart', () => {
    const linux = { platform: 'linux' as const }
    expect(detectInstallMode(env({ ...linux, execPath: '/home/me/.local/share/baton/baton' })).mode).toBe('linux-user')
    expect(detectInstallMode(env({ ...linux, execPath: '/opt/Baton/baton' }))).toEqual({ mode: 'linux-pkg', packager: 'deb' })
    expect(detectInstallMode(env({ ...linux, execPath: '/opt/Baton/baton', has: (p) => p !== 'apt-get' })).packager).toBe('rpm')
    expect(detectInstallMode(env({ ...linux, execPath: '/opt/Baton/baton', has: () => false })).mode).toBe('manual')
  })
})

describe('downloadAsset', () => {
  const body = 'package bytes'
  const serve = (async () => new Response(body)) as unknown as typeof fetch
  const sha = createHash('sha256').update(body).digest('hex')

  it('saves the package and checks its checksum', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baton-test-'))
    const file = await downloadAsset({ name: 'a.zip', url: 'https://example.test/a.zip', sha256: sha }, dir, () => {}, serve)
    expect(readFileSync(file, 'utf8')).toBe(body)
  })

  it('rejects a package that does not match its checksum', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'baton-test-'))
    await expect(
      downloadAsset({ name: 'a.zip', url: 'https://example.test/a.zip', sha256: 'bad' }, dir, () => {}, serve)
    ).rejects.toThrow('checksum')
  })
})

describe('install scripts', () => {
  const env: InstallEnv = {
    platform: 'darwin',
    execPath: '/Applications/Baton.app/Contents/MacOS/Baton',
    home: '/home/u',
    brew: null,
    writable: () => true,
    has: () => true
  }

  it('kills the old app before replacing it and opens the installed bundle', () => {
    const script = installScript('mac-zip', '/tmp/u/Baton-1.0.0.zip', env, 'deb')
    expect(script).toContain('kill -TERM')
    expect(script).toContain('kill -KILL')
    expect(script).toContain("pkill -f '/Applications/Baton.app/Contents/'")
    expect(script.indexOf('kill -KILL')).toBeLessThan(script.indexOf('mv '))
    expect(script).toContain("open '/Applications/Baton.app'")
  })

  it('upgrades through brew only once the old app is gone, then opens it by path', () => {
    const script = brewScript('/opt/homebrew/bin/brew', 42, '/Applications/Baton.app')
    expect(script.indexOf('kill -KILL 42')).toBeLessThan(script.indexOf('upgrade --cask'))
    expect(script).toContain("open '/Applications/Baton.app'")
    expect(script).not.toContain('open -a')
  })
})
