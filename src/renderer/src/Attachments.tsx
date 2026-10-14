import { useEffect, useRef, useState } from 'react'
import type { FileRef, ImageRef } from '../../shared/types'
import { useT } from './i18n'
import type { Draft } from './useAttachments'

/** Button opening the file picker. */
export function AttachButton({ onPick }: { onPick(files: File[]): void }) {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        type="button"
        className="attach"
        title={t.feature.attachHint}
        aria-label={t.feature.attach}
        onClick={() => input.current?.click()}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M13.2 7.3 7.9 12.6a3.2 3.2 0 0 1-4.5-4.5l5.6-5.6a2.1 2.1 0 0 1 3 3L6.5 11a1 1 0 0 1-1.5-1.5l5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          onPick([...(e.target.files ?? [])])
          // Picking the same file twice in a row must fire again.
          e.target.value = ''
        }}
      />
    </>
  )
}

/** What is about to be sent, each attachment removable. */
export function DraftAttachments({
  drafts,
  rejected,
  onRemove
}: {
  drafts: Draft[]
  rejected: string[]
  onRemove(id: number): void
}) {
  const t = useT()
  if (!drafts.length && !rejected.length) return null
  return (
    <>
      {drafts.length > 0 && (
        <div className="attachments">
          {drafts.map((draft) => (
            <div className={`attachment ${draft.kind}`} key={draft.id} title={draft.name}>
              {draft.kind === 'image' ? (
                <img src={`data:${draft.mediaType};base64,${draft.data}`} alt={draft.name} />
              ) : (
                <span className="attachment-name">{draft.name}</span>
              )}
              <button type="button" aria-label={t.feature.removeAttachment} onClick={() => onRemove(draft.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {rejected.length > 0 && <p className="form-error">{t.feature.attachRejected(rejected.join(', '))}</p>}
    </>
  )
}

/** Attachments of a message already sent, read back from the feature's folder. */
export function SentAttachments({
  featureId,
  images,
  files
}: {
  featureId: string
  images: ImageRef[]
  files: FileRef[]
}) {
  if (!images.length && !files.length) return null
  return (
    <div className="attachments sent">
      {images.map((image) => (
        <SentImage key={image.name} featureId={featureId} name={image.name} />
      ))}
      {files.map((file) => (
        <button
          key={file.name}
          className="attachment file"
          title={file.label}
          onClick={() => void window.api.openAttachment(featureId, file.name)}
        >
          <span className="attachment-name">{file.label}</span>
        </button>
      ))}
    </div>
  )
}

function SentImage({ featureId, name }: { featureId: string; name: string }) {
  const t = useT()
  /** Undefined while loading, null when the file is gone. */
  const [url, setUrl] = useState<string | null>()

  useEffect(() => {
    let stale = false
    window.api.attachmentUrl(featureId, name).then(
      (found) => !stale && setUrl(found),
      () => !stale && setUrl(null)
    )
    return () => {
      stale = true
    }
  }, [featureId, name])

  if (url === null) return <span className="attachment missing">{t.feature.attachmentMissing}</span>
  return <div className="attachment image">{url && <img src={url} alt="" />}</div>
}
