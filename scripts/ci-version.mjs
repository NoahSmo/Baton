// Version a CI release gets, printed on stdout.
//
//   node scripts/ci-version.mjs   reads package.json and the v* git tags
//
// package.json ahead of every tag means a version was bumped by hand (minor or
// major): that one is released. Otherwise the push is a patch on top of the
// latest tag. Nothing is committed back, so the release never retriggers CI.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const parse = (v) => v.replace(/^v/i, '').split('.').map(Number)

function compare(a, b) {
  const [x, y] = [parse(a), parse(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

/** The version to release, given package.json's version and the existing tags. */
export function nextVersion(packageVersion, tags) {
  const released = tags.filter((t) => /^v\d+\.\d+\.\d+$/.test(t)).sort(compare).pop()
  if (!released || compare(packageVersion, released) > 0) return packageVersion
  const [major, minor, patch] = parse(released)
  return `${major}.${minor}.${patch + 1}`
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const tags = execFileSync('git', ['tag', '--list', 'v*'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
  console.log(nextVersion(version, tags))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
