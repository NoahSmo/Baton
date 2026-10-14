import { useCallback, useState, type ClipboardEvent, type DragEvent } from 'react'
import {
  IMAGE_MEDIA_TYPES,
  MAX_ATTACHED_FILE_BYTES,
  type ImageInput,
  type MessageAttachments
} from '../../shared/types'

/** Raw size under which a file fits the API limit once base64-encoded. */
const MAX_RAW_BYTES = 3.5 * 1024 * 1024
/** Longest edge kept when an image has to be re-encoded; the model sees no more detail beyond it. */
const MAX_EDGE = 2000

/** An image goes to the model as it is; any other file is handed over by path, for the agent to read. */
export type Draft =
  | ({ kind: 'image'; id: number; name: string } & ImageInput)
  | { kind: 'file'; id: number; name: string; path: string }

let nextId = 1

function readBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const url = reader.result as string
      resolve(url.slice(url.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })
}

/** Shrinks to a JPEG whatever the model cannot take as it is: other formats, and files too heavy. */
async function reencode(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  // JPEG has no transparency: without a backdrop, clear pixels come out black.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode'))), 'image/jpeg', 0.85)
  )
}

export async function toImageInput(file: File): Promise<ImageInput> {
  const supported = IMAGE_MEDIA_TYPES.find((type) => type === file.type)
  if (supported && file.size <= MAX_RAW_BYTES) return { mediaType: supported, data: await readBase64(file) }
  return { mediaType: 'image/jpeg', data: await readBase64(await reencode(file)) }
}

/** Null for what cannot be attached: no file on disk behind it, or too heavy. */
function toFileDraft(file: File): Draft | null {
  const path = window.api.pathForFile(file)
  if (!path || file.size > MAX_ATTACHED_FILE_BYTES) return null
  return { kind: 'file', id: nextId++, name: file.name, path }
}

async function toDraft(file: File): Promise<Draft | null> {
  if (!file.type.startsWith('image/')) return toFileDraft(file)
  try {
    return { kind: 'image', id: nextId++, name: file.name, ...(await toImageInput(file)) }
  } catch {
    // An image this browser cannot decode is still a file the agent can open.
    return toFileDraft(file)
  }
}

/** What leaves with the message, in the shape the main process takes. */
export function toMessageAttachments(drafts: Draft[]): MessageAttachments {
  return {
    images: drafts.flatMap((d) => (d.kind === 'image' ? [{ mediaType: d.mediaType, data: d.data }] : [])),
    files: drafts.flatMap((d) => (d.kind === 'file' ? [d.path] : []))
  }
}

/** Images and documents waiting to leave with the next message, fed by the file picker, the clipboard and drops. */
export function useAttachments() {
  const [drafts, setDrafts] = useState<Draft[]>([])
  /** Names of the files that could not be attached. */
  const [rejected, setRejected] = useState<string[]>([])

  const add = useCallback(async (files: File[]) => {
    if (!files.length) return
    const results = await Promise.all(files.map(toDraft))
    setDrafts((prev) => [...prev, ...results.filter((r) => r !== null)])
    setRejected(files.filter((_, i) => results[i] === null).map((f) => f.name))
  }, [])

  const remove = useCallback((id: number) => setDrafts((prev) => prev.filter((d) => d.id !== id)), [])

  const clear = useCallback(() => {
    setDrafts([])
    setRejected([])
  }, [])

  const onPaste = useCallback(
    (e: ClipboardEvent) => {
      const files = [...e.clipboardData.files]
      if (!files.length) return
      // A copied file often comes with its name as text; the file is what was meant.
      e.preventDefault()
      void add(files)
    },
    [add]
  )

  const onDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault()
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      // Left alone, the window would navigate to the dropped file.
      e.preventDefault()
      void add([...e.dataTransfer.files])
    },
    [add]
  )

  return { drafts, rejected, add, remove, clear, onPaste, onDragOver, onDrop }
}
