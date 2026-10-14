#!/usr/bin/env node
// Cuts a release: bumps the version, builds the macOS zip and the Linux
// packages, publishes them on GitHub and points the Homebrew cask at it.
//
//   npm run release -- 0.2.0            publish version 0.2.0
//   npm run release -- 0.2.0 --dry-run  build and show what would be published
//
// Needs: a clean main branch, the gh CLI logged in, Docker running (for the
// Linux packages), and a checkout of the tap next to this repo (or its path in
// HOMEBREW_TAP_DIR).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const version = args.find((a) => !a.startsWith('-'))
const tapDir = resolve(process.env.HOMEBREW_TAP_DIR ?? join(root, '..', 'homebrew-tap'))
const caskFile = join(tapDir, 'Casks', 'baton.rb')

const run = (cmd, cmdArgs, cwd = root) => execFileSync(cmd, cmdArgs, { cwd, stdio: 'inherit' })
const read = (cmd, cmdArgs, cwd = root) => execFileSync(cmd, cmdArgs, { cwd, encoding: 'utf8' }).trim()
const fail = (message) => {
  console.error(`release: ${message}`)
  process.exit(1)
}

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

function main() {
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) fail('usage: npm run release -- <major.minor.patch> [--dry-run]')
  const current = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
  const tag = `v${version}`

  if (!existsSync(caskFile)) fail(`cask not found at ${caskFile} (set HOMEBREW_TAP_DIR)`)
  if (read('git', ['tag', '--list', tag])) fail(`tag ${tag} already exists`)
  if (!dryRun) {
    if (read('git', ['branch', '--show-current']) !== 'main') fail('releases are cut from main')
    if (read('git', ['status', '--porcelain'])) fail('commit or stash your changes first')
    if (read('git', ['status', '--porcelain'], tapDir)) fail(`the tap at ${tapDir} has uncommitted changes`)
  }

  console.log(`release: ${current} → ${version}${dryRun ? ' (dry run)' : ''}`)
  run('npm', ['version', version, '--no-git-tag-version'])
  try {
    run('npm', ['run', 'typecheck'])
    run('npm', ['test'])
    run('npm', ['run', 'dist'])
    run(join(root, 'scripts', 'build-linux.sh'), [])
  } catch (err) {
    run('npm', ['version', current, '--no-git-tag-version', '--allow-same-version'])
    throw err
  }

  const zip = join(root, 'dist', `Baton-${version}.zip`)
  const linux = readdirSync(join(root, 'dist'))
    .filter((f) => f.startsWith(`Baton-${version}-linux-`))
    .map((f) => join(root, 'dist', f))
  if (linux.length !== 6) fail(`expected 6 Linux packages, found ${linux.length}`)
  const sha256 = createHash('sha256').update(readFileSync(zip)).digest('hex')
  const cask = bumpCask(readFileSync(caskFile, 'utf8'), version, sha256)

  if (dryRun) {
    run('npm', ['version', current, '--no-git-tag-version', '--allow-same-version'])
    console.log(`release: built ${[zip, ...linux].join('\nrelease: built ')}\nrelease: sha256 ${sha256}\nrelease: cask would become:\n\n${cask}`)
    return
  }

  run('git', ['commit', '-am', `Release ${tag}`])
  run('git', ['tag', tag])
  run('git', ['push', 'origin', 'main', tag])
  run('gh', ['release', 'create', tag, zip, ...linux, '--title', tag, '--generate-notes'])

  writeFileSync(caskFile, cask)
  run('git', ['commit', '-am', `baton ${version}`], tapDir)
  run('git', ['push'], tapDir)
  console.log(`release: ${tag} published; brew upgrade --cask noahsmo/tap/baton picks it up`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
