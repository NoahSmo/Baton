import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JavaScript release script, no type declarations
import { bumpCask } from '../scripts/release.mjs'

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
