import { useEffect, useRef, useState } from 'react'
import type { Feature } from '../../shared/types'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'

interface Props {
  feature: Feature
  onClose(): void
}

/** Claude words the pull request of the branch; the user edits it before it is opened. */
export function PullRequestDialog({ feature, onClose }: Props) {
  const t = useT()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [base, setBase] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const typed = useRef(false)
  const latest = useRef(0)

  async function draft(force: boolean) {
    const run = ++latest.current
    setDrafting(true)
    setError(null)
    try {
      const out = await window.api.draftPullRequest(feature.id)
      if (run !== latest.current) return
      setBase(out.base)
      if (!out.title) setError(t.pr.draftFailed)
      else if (force || !typed.current) {
        setTitle(out.title)
        setBody(out.body)
        typed.current = false
      }
    } catch (err) {
      if (run === latest.current) setError(cleanError(err))
    } finally {
      if (run === latest.current) setDrafting(false)
    }
  }

  useEffect(() => {
    void draft(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      latest.current++
      window.api.cancelDraftPullRequest(feature.id)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function create() {
    setBusy(true)
    setError(null)
    try {
      await window.api.createPullRequest(feature.id, { title, body, base })
      onClose()
    } catch (err) {
      setError(cleanError(err))
      setBusy(false)
    }
  }

  const ready = Boolean(title.trim() && base) && !busy

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dialog commit-dialog" role="dialog" aria-labelledby="pr-title">
        <h2 id="pr-title">{t.pr.title}</h2>
        <p className="hint">
          {feature.branch}
          {base && ` · ${t.pr.into(base)}`} · {t.pr.hint}
        </p>
        <div className="commit-head">
          <label>{t.pr.titleLabel}</label>
          <button className="link" disabled={drafting || busy} onClick={() => void draft(true)}>
            {drafting ? t.pr.drafting : t.pr.redraft}
          </button>
        </div>
        <input
          value={title}
          placeholder={drafting ? t.pr.drafting : undefined}
          onChange={(e) => {
            typed.current = true
            setTitle(e.target.value)
          }}
        />
        <label>{t.pr.bodyLabel}</label>
        <textarea
          rows={10}
          value={body}
          onChange={(e) => {
            typed.current = true
            setBody(e.target.value)
          }}
        />
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions">
          <button onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </button>
          <button className="primary" disabled={!ready} onClick={() => void create()}>
            {busy ? t.pr.creating : t.pr.submit}
          </button>
        </div>
      </div>
    </div>
  )
}
