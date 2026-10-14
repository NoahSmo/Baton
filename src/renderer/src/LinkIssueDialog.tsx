import { useEffect, useState } from 'react'
import type { Feature, LinearIssue, Project } from '../../shared/types'
import { useT } from './i18n'
import { IssueStateFilter, matchesIssueFilter } from './IssueStateFilter'
import { cleanError } from './NewFeatureDialog'

interface Props {
  feature: Feature
  project: Project
  onClose(): void
  onLinked(issue: LinearIssue): void
}

/** Ties an agent that already exists to a Linear issue. */
export function LinkIssueDialog({ feature, project, onClose, onLinked }: Props) {
  const t = useT()
  const [issues, setIssues] = useState<LinearIssue[] | null>(null)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [stateFilter, setStateFilter] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const linearLabel = project.linearLabel

  useEffect(() => {
    let stale = false
    // A repository linked to a label offers its issues; any other, those assigned to the user.
    const load = linearLabel ? window.api.linearLabelIssues(linearLabel.id) : window.api.linearIssues()
    load.then(
      (list) => !stale && setIssues(list),
      (err) => !stale && setError(cleanError(err))
    )
    return () => {
      stale = true
    }
  }, [linearLabel?.id])

  async function pick(issue: LinearIssue) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await window.api.linkIssue(feature.id, issue)
      onLinked(issue)
    } catch (err) {
      setError(cleanError(err))
      setBusy(false)
    }
  }

  const shown = (issues ?? []).filter((i) => matchesIssueFilter(i, stateFilter, text))

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <h2>
          {t.linkIssue.title} <span className="dialog-context">{feature.title}</span>
        </h2>
        <p className="hint">{t.linkIssue.hint}</p>

        <label htmlFor="li-filter">{linearLabel ? t.newFeature.issueOf(linearLabel.name) : t.linearView.myIssues}</label>
        {!issues && !error ? (
          <p className="hint">{t.newFeature.loadingIssues}</p>
        ) : (
          issues && (
            <>
              <input
                id="li-filter"
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t.newFeature.filterIssues}
              />
              <IssueStateFilter issues={issues} selected={stateFilter} onChange={setStateFilter} />
              <div className="issue-list">
                {shown.map((i) => (
                  <button type="button" key={i.id} className="issue-row" disabled={busy} onClick={() => void pick(i)}>
                    <span className="issue-id">{i.identifier}</span>
                    <span className="issue-title">{i.title}</span>
                    <span className="issue-state">{i.stateName}</span>
                  </button>
                ))}
                {!shown.length && <p className="hint">{t.linearView.noIssues}</p>}
              </div>
            </>
          )
        )}

        {error && <p className="form-error">{error}</p>}

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t.common.cancel}
          </button>
        </div>
      </div>
    </div>
  )
}
