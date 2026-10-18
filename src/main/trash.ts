import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Feature, TrashEntry } from '../shared/types'
import { resolveInside } from './files'
import { gitStatus } from './git'
import { git, gitRaw } from './worktree'

/** How long a removed feature's changes are kept. */
export const TRASH_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

/** A file bigger than this is not worth keeping in a backup. */
const MAX_UNTRACKED_BYTES = 20 * 1024 * 1024

interface Meta extends TrashEntry {
  /** Commit the branch was at, to recreate it if it disappears. */
  head: string
}

const PATCH = 'changes.patch'
const UNTRACKED = 'untracked'

/**
 * Copies what a worktree holds beyond its last commit into `dir`: the diff of tracked
 * files as a patch, untracked files as they are. Returns how many files that is.
 */
export async function captureChanges(root: string, dir: string): Promise<number> {
  const { changes } = await gitStatus(root)
  if (!changes.length) return 0
  await mkdir(dir, { recursive: true })
  // A repository without a commit has no HEAD to diff against.
  const patch = await gitRaw(root, 'diff', 'HEAD', '--binary').catch(() => '')
  if (patch) await writeFile(join(dir, PATCH), patch)
  for (const change of changes) {
    if (change.kind !== 'untracked') continue
    const from = await resolveInside(root, change.path).catch(() => null)
    if (!from || (await stat(from)).size > MAX_UNTRACKED_BYTES) continue
    const to = join(dir, UNTRACKED, change.path)
    await mkdir(dirname(to), { recursive: true })
    await copyFile(from, to)
  }
  return changes.length
}

/** Puts changes saved by `captureChanges` back on a worktree. */
export async function applyChanges(dir: string, root: string): Promise<void> {
  if (existsSync(join(dir, PATCH))) await git(root, 'apply', '--binary', '--whitespace=nowarn', join(dir, PATCH))
  const base = join(dir, UNTRACKED)
  const walk = async (rel: string): Promise<void> => {
    for (const e of await readdir(join(base, rel), { withFileTypes: true })) {
      const next = join(rel, e.name)
      if (e.isDirectory()) await walk(next)
      else {
        await mkdir(dirname(join(root, next)), { recursive: true })
        await copyFile(join(base, next), join(root, next))
      }
    }
  }
  if (existsSync(base)) await walk('')
}

/**
 * Keeps the uncommitted work of a feature about to be removed. Nothing is written when the
 * worktree is clean: the branch already holds everything.
 */
export async function saveToTrash(trashRoot: string, feature: Feature, projectName: string): Promise<TrashEntry | null> {
  const dir = join(trashRoot, feature.id)
  const files = await captureChanges(feature.worktreePath, dir).catch(() => 0)
  if (!files) {
    await rm(dir, { recursive: true, force: true })
    return null
  }
  const head = await git(feature.worktreePath, 'rev-parse', 'HEAD').catch(() => '')
  const meta: Meta = {
    id: feature.id,
    title: feature.title,
    branch: feature.branch,
    projectId: feature.projectId,
    projectName,
    deletedAt: Date.now(),
    files,
    head
  }
  await writeFile(join(dir, 'meta.json'), JSON.stringify(meta, null, 2))
  const { head: _head, ...entry } = meta
  return entry
}

export async function readMeta(trashRoot: string, id: string): Promise<Meta | null> {
  // Ids come from the renderer: only a plain folder name is looked up.
  if (!/^[\w-]+$/.test(id)) return null
  try {
    return JSON.parse(await readFile(join(trashRoot, id, 'meta.json'), 'utf8')) as Meta
  } catch {
    return null
  }
}

/** Entries still kept, the latest first. Those past their time are deleted on the way. */
export async function listTrash(trashRoot: string, now = Date.now()): Promise<TrashEntry[]> {
  const names = await readdir(trashRoot).catch(() => [] as string[])
  const entries: Meta[] = []
  for (const name of names) {
    const meta = await readMeta(trashRoot, name)
    if (!meta || now - meta.deletedAt > TRASH_DAYS * DAY_MS) await rm(join(trashRoot, name), { recursive: true, force: true })
    else entries.push(meta)
  }
  return entries.sort((a, b) => b.deletedAt - a.deletedAt).map(({ head: _head, ...entry }) => entry)
}

export const discardTrash = (trashRoot: string, id: string) =>
  /^[\w-]+$/.test(id) ? rm(join(trashRoot, id), { recursive: true, force: true }) : Promise.resolve()
