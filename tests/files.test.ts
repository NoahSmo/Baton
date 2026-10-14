import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fileMtime, isNoise, listDir, MAX_FILE_BYTES, readTextFile, resolveInside, writeTextFile } from '../src/main/files'

let base: string
let root: string

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'baton-files-'))
  root = join(base, 'worktree')
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, '.git'))
  writeFileSync(join(root, 'src', 'b.ts'), 'export const b = 2\n')
  writeFileSync(join(root, 'src', 'a10.ts'), '')
  writeFileSync(join(root, 'src', 'a2.ts'), '')
  writeFileSync(join(root, 'README.md'), '# Hello\n')
  writeFileSync(join(root, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]))
  writeFileSync(join(base, 'secret.txt'), 'outside')
  symlinkSync(join(base, 'secret.txt'), join(root, 'link.txt'))
  symlinkSync(base, join(root, 'up'))
})

afterAll(() => rmSync(base, { recursive: true, force: true }))

describe('resolveInside', () => {
  it('accepts paths of the worktree, the root included', async () => {
    expect(await resolveInside(root, '')).toBe(root)
    expect(await resolveInside(root, 'src/b.ts')).toBe(join(root, 'src', 'b.ts'))
  })

  it('refuses to leave the worktree', async () => {
    await expect(resolveInside(root, '../secret.txt')).rejects.toThrow('Outside')
    await expect(resolveInside(root, 'src/../../secret.txt')).rejects.toThrow('Outside')
    await expect(resolveInside(root, join(base, 'secret.txt'))).rejects.toThrow('Outside')
  })

  it('refuses symlinks pointing outside, for files that do not exist yet too', async () => {
    await expect(resolveInside(root, 'link.txt')).rejects.toThrow('Outside')
    await expect(resolveInside(root, 'up/secret.txt')).rejects.toThrow('Outside')
    await expect(resolveInside(root, 'up/new.txt')).rejects.toThrow('Outside')
  })
})

describe('listDir', () => {
  it('lists folders first and hides git internals', async () => {
    expect((await listDir(root, '')).map((e) => e.name)).toEqual(['src', 'up', 'link.txt', 'logo.png', 'README.md'])
  })

  it('sorts numbers naturally and returns paths relative to the worktree', async () => {
    expect((await listDir(root, 'src')).map((e) => e.path)).toEqual(['src/a2.ts', 'src/a10.ts', 'src/b.ts'])
  })
})

describe('reading and writing', () => {
  it('reads text with its mtime', async () => {
    const file = await readTextFile(root, 'README.md')
    expect(file).toMatchObject({ kind: 'text', content: '# Hello\n' })
    expect(file.kind === 'text' && file.mtimeMs).toBe(await fileMtime(root, 'README.md'))
  })

  it('does not open binary or oversized files', async () => {
    expect(await readTextFile(root, 'logo.png')).toEqual({ kind: 'binary' })
    writeFileSync(join(root, 'big.log'), 'x'.repeat(MAX_FILE_BYTES + 1))
    expect(await readTextFile(root, 'big.log')).toEqual({ kind: 'too_large', size: MAX_FILE_BYTES + 1 })
  })

  it('writes inside the worktree only', async () => {
    const mtime = await writeTextFile(root, 'src/b.ts', 'export const b = 3\n')
    expect(readFileSync(join(root, 'src', 'b.ts'), 'utf8')).toBe('export const b = 3\n')
    expect(mtime).toBe(await fileMtime(root, 'src/b.ts'))
    await expect(writeTextFile(root, 'link.txt', 'hacked')).rejects.toThrow('Outside')
    expect(readFileSync(join(base, 'secret.txt'), 'utf8')).toBe('outside')
  })

  it('writes back a file deleted under the editor', async () => {
    expect(await fileMtime(root, 'src/gone.ts')).toBeNull()
    await writeTextFile(root, 'src/gone.ts', 'back\n')
    expect(readFileSync(join(root, 'src', 'gone.ts'), 'utf8')).toBe('back\n')
  })
})

describe('isNoise', () => {
  it('ignores git internals and dependencies, wherever they sit', () => {
    expect(isNoise('.git/index')).toBe(true)
    expect(isNoise('packages/app/node_modules/x/index.js')).toBe(true)
    expect(isNoise('src/gitignore.ts')).toBe(false)
    expect(isNoise('.github/workflows/ci.yml')).toBe(false)
  })
})
