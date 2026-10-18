import { useEffect, useRef, useState } from 'react'
import type { Feature } from '../../shared/types'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'

interface Props {
  feature: Feature
  onClose(): void
  onCreated(feature: Feature): void
}

/** Claude sums up an agent's work; the user edits it, and a new agent carries on from there. */
export function ContinueDialog({ feature, onClose, onCreated }: Props) {
  const t = useT()
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
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
      const out = await window.api.draftHandoff(feature.id)
      if (run !== latest.current) return
      if (!out.summary) setError(t.handoff.draftFailed)
      else if (force || !typed.current) {
        setSummary(out.summary)
        typed.current = false
      }
      setTitle((current) => current || out.title)
    } catch (err) {
      if (run === latest.current) setError(cleanError(err))
    } finally {
      if (run === latest.current) setDrafting(false)
    }
  }

  useEffect(() => {
    setTitle(t.handoff.title(feature.title))
    void draft(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      latest.current++
      window.api.cancelDraftHandoff(feature.id)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function create() {
    setBusy(true)
    setError(null)
    try {
      onCreated(await window.api.continueFeature(feature.id, { title, summary }))
    } catch (err) {
      setError(cleanError(err))
      setBusy(false)
    }
  }

  const ready = Boolean(title.trim() && summary.trim()) && !busy

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dialog commit-dialog" role="dialog" aria-labelledby="continue-title">
        <h2 id="continue-title">{t.handoff.dialogTitle}</h2>
        <p className="hint">{t.handoff.hint}</p>
        <label>{t.handoff.name}</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="commit-head">
          <label>{t.handoff.summary}</label>
          <button className="link" disabled={drafting || busy} onClick={() => void draft(true)}>
            {drafting ? t.handoff.drafting : t.handoff.redraft}
          </button>
        </div>
        <textarea
          rows={12}
          value={summary}
          placeholder={drafting ? t.handoff.drafting : undefined}
          onChange={(e) => {
            typed.current = true
            setSummary(e.target.value)
          }}
        />
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions">
          <button onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </button>
          <button className="primary" disabled={!ready} onClick={() => void create()}>
            {busy ? t.handoff.creating : t.handoff.create}
          </button>
        </div>
      </div>
    </div>
  )
}
