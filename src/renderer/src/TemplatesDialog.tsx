import { useState, type FormEvent } from 'react'
import type { Project, PromptTemplate } from '../../shared/types'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'

interface Props {
  project: Project
  onClose(): void
  onSaved(project: Project): void
}

const blank = (): PromptTemplate => ({ id: crypto.randomUUID(), name: '', text: '' })

/** Edits the ready-made prompts of a project. */
export function TemplatesDialog({ project, onClose, onSaved }: Props) {
  const t = useT()
  const [rows, setRows] = useState<PromptTemplate[]>(() => (project.templates.length ? project.templates : [blank()]))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const edit = (id: string, patch: Partial<PromptTemplate>) =>
    setRows((list) => list.map((row) => (row.id === id ? { ...row, ...patch } : row)))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      onSaved(await window.api.setProjectTemplates(project.id, rows))
    } catch (err) {
      setError(cleanError(err))
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" onSubmit={submit}>
        <h2>{t.templates.title}</h2>
        <p className="hint">{t.templates.hint}</p>
        <div className="template-rows">
          {rows.map((row, i) => (
            <div className="template-row" key={row.id}>
              <input
                aria-label={t.templates.name}
                placeholder={t.templates.namePlaceholder}
                value={row.name}
                autoFocus={i === rows.length - 1 && !row.text}
                onChange={(e) => edit(row.id, { name: e.target.value })}
              />
              <textarea
                aria-label={t.templates.text}
                placeholder={t.templates.textPlaceholder}
                rows={2}
                value={row.text}
                onChange={(e) => edit(row.id, { text: e.target.value })}
              />
              <button
                type="button"
                className="icon"
                title={t.templates.remove}
                aria-label={t.templates.remove}
                onClick={() => setRows((list) => list.filter((r) => r.id !== row.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <p className="hint">
          <button type="button" className="link" onClick={() => setRows((list) => [...list, blank()])}>
            <span className="plus">+</span> {t.templates.add}
          </button>
        </p>
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {t.common.save}
          </button>
        </div>
      </form>
    </div>
  )
}

/** One-click prompts of a project, as chips. */
export function TemplateChips({ templates, onPick }: { templates: PromptTemplate[]; onPick(text: string): void }) {
  const t = useT()
  if (!templates.length) return null
  return (
    <div className="template-chips" role="group" aria-label={t.feature.templates}>
      {templates.map((x) => (
        <button key={x.id} type="button" className="filter" title={x.text} onClick={() => onPick(x.text)}>
          {x.name}
        </button>
      ))}
    </div>
  )
}
