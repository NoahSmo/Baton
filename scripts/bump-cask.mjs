// Points the Homebrew cask at a new release.
//
//   node scripts/bump-cask.mjs <cask file> <version> <sha256>
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The cask with its version and checksum replaced. */
export function bumpCask(cask, nextVersion, sha256) {
  const bumped = cask
    .replace(/^(\s*version\s+)"[^"]*"/m, `$1"${nextVersion}"`)
    .replace(/^(\s*sha256\s+)"[^"]*"/m, `$1"${sha256}"`)
  if (!bumped.includes(`"${nextVersion}"`) || !bumped.includes(`"${sha256}"`)) {
    throw new Error('could not find the version and sha256 lines in the cask')
  }
  return bumped
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, version, sha256] = process.argv.slice(2)
  if (!file || !version || !sha256) {
    console.error('usage: node scripts/bump-cask.mjs <cask file> <version> <sha256>')
    process.exit(1)
  }
  writeFileSync(file, bumpCask(readFileSync(file, 'utf8'), version, sha256))
}
