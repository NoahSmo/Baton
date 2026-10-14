import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  MAX_IMAGE_BASE64_CHARS,
  readImageUrl,
  removeAttachments,
  saveFiles,
  saveImages,
  storedFilePath,
  withFiles
} from '../src/main/attachments'
import type { ImageInput } from '../src/shared/types'

let base: string
let dir: string

const png: ImageInput = { mediaType: 'image/png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64') }

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'baton-attachments-'))
  dir = join(base, 'feature')
  writeFileSync(join(base, 'secret.png'), 'outside')
})

afterAll(() => rmSync(base, { recursive: true, force: true }))

describe('saveImages', () => {
  it('writes each image and names it after its format', () => {
    const [ref] = saveImages(dir, [png])
    expect(ref.mediaType).toBe('image/png')
    expect(ref.name).toMatch(/\.png$/)
    expect(readFileSync(join(dir, ref.name))).toEqual(Buffer.from(png.data, 'base64'))
  })

  it('creates no folder for a message without images', () => {
    const empty = join(base, 'empty')
    expect(saveImages(empty, [])).toEqual([])
    expect(existsSync(empty)).toBe(false)
  })

  it('refuses the whole message when one image is not acceptable', () => {
    const other = join(base, 'other')
    const svg = { mediaType: 'image/svg+xml', data: '' } as unknown as ImageInput
    expect(() => saveImages(other, [png, svg])).toThrow()
    expect(() => saveImages(other, [png, { ...png, data: 'A'.repeat(MAX_IMAGE_BASE64_CHARS + 1) }])).toThrow()
    expect(existsSync(other)).toBe(false)
  })
})

describe('readImageUrl', () => {
  it('gives back a stored image as a data URL', () => {
    const [ref] = saveImages(dir, [png])
    expect(readImageUrl(dir, ref.name)).toBe(`data:image/png;base64,${png.data}`)
  })

  it('reads nothing but the files it named itself', () => {
    expect(readImageUrl(dir, '../secret.png')).toBeNull()
    expect(readImageUrl(dir, 'secret.png')).toBeNull()
    expect(readImageUrl(dir, '00000000-0000-0000-0000-000000000000.png')).toBeNull()
  })
})

describe('saveFiles', () => {
  it('copies a document under a name safe to pass to a shell', () => {
    const source = join(base, 'Spéc client (v2).xlsx')
    writeFileSync(source, 'cells')
    const [ref] = saveFiles(dir, [source])
    expect(ref).toMatchObject({ label: 'Spéc client (v2).xlsx', size: 5 })
    expect(ref.name).toMatch(/^[0-9a-f-]{36}-Spéc_client__v2_\.xlsx$/)
    expect(readFileSync(join(dir, ref.name), 'utf8')).toBe('cells')
    expect(storedFilePath(dir, ref.name)).toBe(join(dir, ref.name))
  })

  it('refuses the whole message when one path is not a file', () => {
    const other = join(base, 'other-files')
    expect(() => saveFiles(other, [join(base, 'secret.png'), base])).toThrow()
    expect(() => saveFiles(other, [join(base, 'missing.pdf')])).toThrow()
    expect(existsSync(other)).toBe(false)
  })
})

describe('storedFilePath', () => {
  it('resolves nothing but the files it named itself', () => {
    expect(storedFilePath(dir, '../secret.png')).toBeNull()
    expect(storedFilePath(dir, '00000000-0000-0000-0000-000000000000-../x')).toBeNull()
  })
})

describe('withFiles', () => {
  const file = { name: 'id-spec.pdf', label: 'spec.pdf', size: 1 }

  it('names the documents by path after the text', () => {
    expect(withFiles('Integrate this', '/att', [file])).toBe('Integrate this\n\nAttached files:\n- /att/id-spec.pdf')
    expect(withFiles('', '/att', [file])).toBe('Attached files:\n- /att/id-spec.pdf')
  })

  it('leaves a message without documents untouched', () => {
    expect(withFiles('hello', '/att', [])).toBe('hello')
  })
})

describe('removeAttachments', () => {
  it('drops the folder of a feature, and tolerates there being none', () => {
    saveImages(dir, [png])
    expect(readdirSync(dir).length).toBeGreaterThan(0)
    removeAttachments(dir)
    removeAttachments(dir)
    expect(existsSync(dir)).toBe(false)
  })
})
