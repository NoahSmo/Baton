import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  IMAGE_MEDIA_TYPES,
  MAX_ATTACHED_FILE_BYTES,
  type FileRef,
  type ImageInput,
  type ImageMediaType,
  type ImageRef
} from '../shared/types'

/** Largest image the API takes, measured on its base64 form. */
export const MAX_IMAGE_BASE64_CHARS = 5 * 1024 * 1024

const EXTENSIONS: Record<ImageMediaType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

/** Names are generated here: anything else is not a file of ours, a path least of all. */
const IMAGE_NAME = /^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/
const FILE_NAME = /^[0-9a-f-]{36}-[^/\\]+$/

function mediaTypeOf(name: string): ImageMediaType | null {
  const ext = IMAGE_NAME.exec(name)?.[1]
  return IMAGE_MEDIA_TYPES.find((type) => EXTENSIONS[type] === ext) ?? null
}

/** Writes the images of one message into the feature's folder. Nothing is written if one of them is refused. */
export function saveImages(dir: string, images: ImageInput[]): ImageRef[] {
  for (const image of images) {
    if (!IMAGE_MEDIA_TYPES.includes(image.mediaType)) throw new Error(`Unsupported image type: ${image.mediaType}`)
    if (image.data.length > MAX_IMAGE_BASE64_CHARS) throw new Error('Image too large.')
  }
  if (images.length) mkdirSync(dir, { recursive: true })
  return images.map((image) => {
    const name = `${randomUUID()}.${EXTENSIONS[image.mediaType]}`
    writeFileSync(join(dir, name), Buffer.from(image.data, 'base64'))
    return { name, mediaType: image.mediaType }
  })
}

/**
 * Copies documents into the feature's folder, so the agent still finds them
 * once the originals have moved. Nothing is copied if one of them is refused.
 */
export function saveFiles(dir: string, paths: string[]): FileRef[] {
  const sizes = paths.map((path) => {
    const stat = statSync(path)
    if (!stat.isFile()) throw new Error(`Not a file: ${path}`)
    if (stat.size > MAX_ATTACHED_FILE_BYTES) throw new Error(`File too large: ${path}`)
    return stat.size
  })
  if (paths.length) mkdirSync(dir, { recursive: true })
  return paths.map((path, i) => {
    const label = basename(path)
    // The agent passes these names to shell commands: nothing in them should need quoting.
    const name = `${randomUUID()}-${label.replace(/[^\p{L}\p{N}._-]/gu, '_').slice(-80)}`
    copyFileSync(path, join(dir, name))
    return { name, label, size: sizes[i] }
  })
}

/** Where a stored document lives, null when the name is not one of ours. */
export function storedFilePath(dir: string, name: string): string | null {
  return FILE_NAME.test(name) ? join(dir, name) : null
}

/** The message as the agent gets it: documents are named by path, for it to read with its own tools. */
export function withFiles(text: string, dir: string, files: FileRef[]): string {
  if (!files.length) return text
  const list = files.map((file) => `- ${join(dir, file.name)}`).join('\n')
  return `${text}${text ? '\n\n' : ''}Attached files:\n${list}`
}

/** Data URL of a stored image, null when the name is not one of ours or the file is gone. */
export function readImageUrl(dir: string, name: string): string | null {
  const mediaType = mediaTypeOf(name)
  if (!mediaType) return null
  try {
    return `data:${mediaType};base64,${readFileSync(join(dir, name)).toString('base64')}`
  } catch {
    return null
  }
}

export function removeAttachments(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
}
