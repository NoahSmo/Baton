import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JavaScript scripts, no type declarations
import { bumpCask } from '../scripts/bump-cask.mjs'
// @ts-expect-error plain JavaScript scripts, no type declarations
import { nextVersion } from '../scripts/ci-version.mjs'

const cask = `cask "baton" do
  version "0.1.0"
  sha256 "aaa"

  url "https://example.test/v#{version}/App-#{version}.zip"
  depends_on macos: :ventura
end
`

describe('bumpCask', () => {
  it('replaces only the version and the checksum', () => {
    expect(bumpCask(cask, '0.2.0', 'bbb')).toBe(cask.replace('"0.1.0"', '"0.2.0"').replace('"aaa"', '"bbb"'))
  })

  it('refuses a cask it does not recognise', () => {
    expect(() => bumpCask('cask "x" do\nend\n', '0.2.0', 'bbb')).toThrow('could not find')
  })
})

describe('nextVersion', () => {
  it('releases package.json when nothing was released yet', () => {
    expect(nextVersion('0.3.0', [])).toBe('0.3.0')
  })

  it('adds a patch when the latest tag is already package.json', () => {
    expect(nextVersion('0.3.0', ['v0.2.0', 'v0.3.0'])).toBe('0.3.1')
  })

  it('adds a patch on top of the latest tag, not of package.json', () => {
    expect(nextVersion('0.3.0', ['v0.3.0', 'v0.3.1', 'v0.3.9', 'v0.3.10'])).toBe('0.3.11')
  })

  it('releases a version bumped by hand', () => {
    expect(nextVersion('0.4.0', ['v0.3.0', 'v0.3.4'])).toBe('0.4.0')
  })

  it('ignores tags that are not releases', () => {
    expect(nextVersion('0.3.0', ['v0.3.0', 'v9', 'nightly'])).toBe('0.3.1')
  })
})
