import { watch, type FSWatcher } from 'node:fs'
import { open, readdir, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { FileContent, FileEntry } from '../shared/types'

/** Beyond this the editor would crawl; such files are generated or data anyway. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024

const HIDDEN = new Set(['.git', '.DS_Store'])

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

/**
 * Absolute path of an entry of `root`. Paths come from the renderer, so anything
 * pointing outside the worktree is refused, symlinks included.
 */
export async function resolveInside(root: string, rel: string): Promise<string> {
  const path = resolve(root, rel)
  if (!isInside(root, path)) throw new Error(`Outside the worktree: ${rel}`)
  // A file deleted under the editor is judged by the folder it would be written to.
  const [realRoot, real] = await Promise.all([realpath(root), realpath(path).catch(() => realpath(dirname(path)))])
  if (!isInside(realRoot, real)) throw new Error(`Outside the worktree: ${rel}`)
  return path
}

/** Folders first, then names in the order a file explorer would show them. */
export async function listDir(root: string, dir: string): Promise<FileEntry[]> {
  const entries = await readdir(await resolveInside(root, dir), { withFileTypes: true })
  const listed = await Promise.all(
    entries
      .filter((e) => !HIDDEN.has(e.name))
      .map(async (e): Promise<FileEntry> => {
        let isDirectory = e.isDirectory()
        if (e.isSymbolicLink()) {
          // A dangling link stays listed, as a file that will fail to open.
          isDirectory = await stat(join(e.parentPath, e.name)).then((s) => s.isDirectory(), () => false)
        }
        return { name: e.name, path: dir ? `${dir}/${e.name}` : e.name, isDirectory }
      })
  )
  return listed.sort(
    (a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name, undefined, { numeric: true })
  )
}

export async function readTextFile(root: string, rel: string): Promise<FileContent> {
  const path = await resolveInside(root, rel)
  const file = await open(path, 'r')
  try {
    const { size, mtimeMs } = await file.stat()
    if (size > MAX_FILE_BYTES) return { kind: 'too_large', size }
    const buffer = await file.readFile()
    // Same test as git: a NUL byte near the start means binary.
    if (buffer.subarray(0, 8000).includes(0)) return { kind: 'binary' }
    return { kind: 'text', content: buffer.toString('utf8'), mtimeMs }
  } finally {
    await file.close()
  }
}

/** Null when the file does not exist. */
export async function fileMtime(root: string, rel: string): Promise<number | null> {
  const path = await resolveInside(root, rel)
  return stat(path).then((s) => s.mtimeMs, () => null)
}

/** Writes a file, creating it when it was deleted meanwhile, and returns its new mtime. */
export async function writeTextFile(root: string, rel: string, content: string): Promise<number> {
  const path = await resolveInside(root, rel)
  await writeFile(path, content, 'utf8')
  return (await stat(path)).mtimeMs
}

/** Past this many paths in one burst (an install, a checkout), the editor refreshes everything instead. */
const MAX_REPORTED = 200
const DEBOUNCE_MS = 150

/** True for paths whose changes the editor never shows. */
export function isNoise(path: string): boolean {
  return path.split('/').some((part) => part === '.git' || part === 'node_modules')
}

/** Watches worktrees so the editor follows what the agent and the terminal write. */
export class FileWatchers {
  private watchers = new Map<string, { watcher: FSWatcher; pending: Set<string>; timer: NodeJS.Timeout | null }>()

  constructor(private readonly onChange: (key: string, paths: string[]) => void) {}

  watch(key: string, root: string): void {
    if (this.watchers.has(key)) return
    const entry = { watcher: null as unknown as FSWatcher, pending: new Set<string>(), timer: null as NodeJS.Timeout | null }
    const flush = () => {
      entry.timer = null
      const paths = [...entry.pending]
      entry.pending.clear()
      this.onChange(key, paths.length > MAX_REPORTED ? [] : paths)
    }
    try {
      entry.watcher = watch(root, { recursive: true }, (_event, filename) => {
        if (!filename) return
        const path = filename.split(sep).join('/')
        if (isNoise(path)) return
        entry.pending.add(path)
        entry.timer ??= setTimeout(flush, DEBOUNCE_MS)
      })
    } catch {
      // The worktree is gone; the editor still works, without live updates.
      return
    }
    // A removed worktree makes the watcher fail rather than close.
    entry.watcher.on('error', () => this.unwatch(key))
    this.watchers.set(key, entry)
  }

  unwatch(key: string): void {
    const entry = this.watchers.get(key)
    if (!entry) return
    entry.watcher.close()
    if (entry.timer) clearTimeout(entry.timer)
    this.watchers.delete(key)
  }

  closeAll(): void {
    for (const key of [...this.watchers.keys()]) this.unwatch(key)
  }
}
