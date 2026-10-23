import { useState, type FormEvent } from 'react'
import type { Feature, Project, QaRun } from '../../shared/types'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'

interface Props {
  project: Project
  features: Feature[]
  runs: QaRun[]
  onClose(): void
  onSaved(project: Project): void
}

/** Sets a project's automatic tests and reads the reports of their runs. */
export function QaDialog({ project, features, runs, onClose, onSaved }: Props) {
  const t = useT()
  const [enabled, setEnabled] = useState(project.qa.enabled)
  const [command, setCommand] = useState(project.qa.command)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const known = new Set(features.map((f) => f.id))
  const [sent, setSent] = useState<Set<string>>(new Set())

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      onSaved(await window.api.setProjectQa(project.id, { enabled, command }))
      onClose()
    } catch (err) {
      setError(cleanError(err))
      setBusy(false)
    }
  }

  async function sendBack(run: QaRun) {
    setError('')
    try {
      await window.api.send(run.featureId, t.qa.agentPrompt(run.command, run.recap, run.output))
      setSent((ids) => new Set(ids).add(run.id))
    } catch (err) {
      setError(cleanError(err))
    }
  }

  async function runAgain(featureId: string) {
    setError('')
    try {
      // Saved first: the run uses the command in the field.
      onSaved(await window.api.setProjectQa(project.id, { enabled, command }))
      await window.api.runQa(featureId)
    } catch (err) {
      setError(cleanError(err))
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog qa-dialog" onSubmit={submit}>
        <h2>{t.qa.title}</h2>
        <p className="hint">{t.qa.hint}</p>

        <label className="qa-toggle">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {t.qa.enabled}
        </label>
        <input
          className="mono"
          aria-label={t.qa.command}
          placeholder={t.qa.commandPlaceholder}
          value={command}
          spellCheck={false}
          onChange={(e) => setCommand(e.target.value)}
        />

        <h3 className="qa-reports-title">{t.qa.reports}</h3>
        <div className="qa-runs">
          {!runs.length && <p className="hint">{t.qa.none}</p>}
          {runs.map((run) => (
            <details className="qa-run" key={run.id} open={run.status === 'failed'}>
              <summary>
                <span className={`dot qa-${run.status}`} />
                <span className="qa-run-title">{run.featureTitle}</span>
                <span className="qa-run-state">{run.status === 'running' ? t.qa.running : t.qa[run.status]}</span>
                <span className="qa-run-meta">
                  {run.status !== 'running' && t.qa.exit(run.exitCode)} · {new Date(run.startedAt).toLocaleString()}
                </span>
              </summary>
              <p className="qa-recap">{run.recap || (run.status === 'running' ? '' : t.qa.recapPending)}</p>
              <pre className="qa-output" aria-label={t.qa.output}>
                {run.output || '—'}
              </pre>
              {known.has(run.featureId) && run.status === 'failed' && (
                <button type="button" className="link" disabled={sent.has(run.id)} onClick={() => void sendBack(run)}>
                  {sent.has(run.id) ? t.qa.sent : t.qa.sendToAgent}
                </button>
              )}
              {known.has(run.featureId) && run.status !== 'running' && (
                <button type="button" className="link" onClick={() => void runAgain(run.featureId)}>
                  {t.qa.run}
                </button>
              )}
            </details>
          ))}
        </div>

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
