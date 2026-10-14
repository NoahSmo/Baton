import { describe, expect, it } from 'vitest'
import { checkForUpdate } from '../src/main/updater'
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
      notes: 'Notes'
    })
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
