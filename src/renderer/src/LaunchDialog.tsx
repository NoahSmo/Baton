import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { LaunchCommand, LaunchSuggestion, Project } from '../../shared/types'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'
import { Icon } from './ui/Icon'

interface Props {
  project: Project
  onClose(): void
  onSaved(project: Project): void
}

const blank = (): LaunchCommand => ({ id: crypto.randomUUID(), name: '', command: '' })

/** Edits the commands of a project that the sidebar starts with one click. */
export function LaunchDialog({ project, onClose, onSaved }: Props) {
  const t = useT()
  const [rows, setRows] = useState<LaunchCommand[]>(() => (project.commands.length ? project.commands : [blank()]))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)
  const [proposal, setProposal] = useState<LaunchSuggestion[] | null>(null)
  /** Set once the reading was stopped on purpose: its failure is then not one to report. */
  const stopped = useRef(false)

  // Nobody is left to read the proposal of a dialog that closed.
  useEffect(() => () => window.api.cancelSuggestCommands(project.id), [project.id])

  async function autoFill() {
    setReading(true)
    setError('')
    setProposal(null)
    stopped.current = false
    try {
      setProposal(await window.api.suggestCommands(project.id))
    } catch (err) {
      if (!stopped.current) setError(t.launch.autoFailed(cleanError(err)))
    } finally {
      setReading(false)
    }
  }

  function stopReading() {
    stopped.current = true
    window.api.cancelSuggestCommands(project.id)
  }

  function acceptProposal() {
    setRows((proposal ?? []).map((s) => ({ ...s, id: crypto.randomUUID() })))
    setProposal(null)
  }

  const edit = (id: string, patch: Partial<LaunchCommand>) =>
    setRows((list) => list.map((row) => (row.id === id ? { ...row, ...patch } : row)))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      onSaved(await window.api.setProjectCommands(project.id, rows))
    } catch (err) {
      setError(cleanError(err))
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" onSubmit={submit}>
        <h2>{t.launch.title}</h2>
        <p className="hint">{t.launch.hint}</p>

        <div className="launch-auto">
          <div>
            <strong>{t.launch.autoTitle}</strong>
            <p className="hint">{reading ? t.launch.autoRunning : t.launch.autoBody}</p>
          </div>
          {reading ? (
            <button type="button" onClick={stopReading}>
              {t.launch.autoStop}
            </button>
          ) : (
            <button type="button" onClick={() => void autoFill()}>
              <span className="plus">✦</span> {t.launch.autoFill}
            </button>
          )}
        </div>

        {proposal && (
          <div className="launch-proposal">
            <p className="launch-proposal-notice">{proposal.length ? t.launch.proposalNotice : t.launch.proposalEmpty}</p>
            {proposal.map((s, i) => (
              <div className="launch-proposal-item" key={i}>
                {s.name && <strong>{s.name}</strong>}
                <code>{s.command}</code>
              </div>
            ))}
            <div className="dialog-actions">
              <button type="button" onClick={() => setProposal(null)}>
                {t.launch.ignore}
              </button>
              {proposal.length > 0 && (
                <button type="button" className="primary" onClick={acceptProposal}>
                  {t.launch.replace}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="launch-rows">
          {rows.map((row, i) => (
            <div className="launch-row" key={row.id}>
              <input
                className="launch-row-name"
                aria-label={t.launch.name}
                placeholder={t.launch.namePlaceholder}
                value={row.name}
                autoFocus={i === rows.length - 1 && !row.command}
                onChange={(e) => edit(row.id, { name: e.target.value })}
              />
              <input
                className="mono"
                aria-label={t.launch.command}
                placeholder={t.launch.commandPlaceholder}
                value={row.command}
                spellCheck={false}
                onChange={(e) => edit(row.id, { command: e.target.value })}
              />
              <button
                type="button"
                className="icon"
                title={t.launch.remove}
                aria-label={t.launch.remove}
                onClick={() => setRows((list) => list.filter((r) => r.id !== row.id))}
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
        </div>
        <p className="hint">
          <button type="button" className="link" onClick={() => setRows((list) => [...list, blank()])}>
            <span className="plus"><Icon name="plus" /></span> {t.launch.add}
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
