import { useEffect, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Feature, LinearIssue, LinearIssueDetails, LinearState } from '../../shared/types'
import { useLang, useT } from './i18n'
import { cleanError } from './NewFeatureDialog'
import { DialogClose } from './DialogClose'

interface Props {
  issue: LinearIssue
  /** Workflow of the issue's team; null while it loads. */
  states: LinearState[] | null
  projectName: string | null
  feature: Feature | null
  canStart: boolean
  onSetState(stateId: string): void
  onSetPriority(priority: number): void
  onStart(): void
  onOpenFeature(feature: Feature): void
  onClose(): void
}

// The window never navigates: links in issue text open in the browser.
const MARKDOWN: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

/** An issue read from Baton: its fields, description and comments, without opening Linear. */
export function IssueDetailDialog({ issue, states, projectName, feature, canStart, onSetState, onSetPriority, onStart, onOpenFeature, onClose }: Props) {
  const t = useT()
  const lang = useLang()
  const [details, setDetails] = useState<LinearIssueDetails | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let stale = false
    window.api.linearIssueDetails(issue.id).then(
      (d) => !stale && setDetails(d),
      (err) => !stale && setError(cleanError(err))
    )
    return () => {
      stale = true
    }
  }, [issue.id])

  const date = (iso: string) => new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })
  // The list carries the description already; the details only refresh it.
  const description = details ? details.description : issue.description

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog issue-dialog">
        <DialogClose onClose={onClose} />
        <h2>
          <span className="issue-id">{issue.identifier}</span> {issue.title}
        </h2>
        {details && <p className="hint">{t.linearView.createdBy(details.creatorName, date(details.createdAt))}</p>}

        <dl className="issue-fields">
          <dt>{t.linearView.status}</dt>
          <dd>
            <select value={issue.stateId} disabled={!states} onChange={(e) => onSetState(e.target.value)}>
              {(states ?? [{ id: issue.stateId, name: issue.stateName }]).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </dd>
          <dt>{t.linearView.priority}</dt>
          <dd>
            <select value={issue.priority} onChange={(e) => onSetPriority(Number(e.target.value))}>
              {[0, 1, 2, 3, 4].map((p) => (
                <option key={p} value={p}>
                  {t.linearView.priorities[p]}
                </option>
              ))}
            </select>
          </dd>
          <dt>{t.linearView.assignee}</dt>
          <dd>{issue.assigneeName ?? t.linearView.unassigned}</dd>
          <dt>{t.linearView.project}</dt>
          <dd>{projectName ?? t.linearView.noProject}</dd>
          {!!details?.labels.length && (
            <>
              <dt>{t.linearView.labels}</dt>
              <dd className="issue-labels">
                {details.labels.map((l) => (
                  <span key={l.name} className="issue-label" style={{ '--label-color': l.color } as React.CSSProperties}>
                    {l.name}
                  </span>
                ))}
              </dd>
            </>
          )}
        </dl>

        <div className="issue-markdown">
          {description?.trim() ? <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN}>{description}</Markdown> : <p className="hint">{t.linearView.noDescription}</p>}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        {!details && !error && <p className="hint">{t.linearView.loadingDetails}</p>}
        {!!details?.comments.length && (
          <section className="issue-comments">
            <h3>{t.linearView.comments(details.comments.length)}</h3>
            {details.comments.map((c) => (
              <article key={c.id} className="issue-comment">
                <header className="hint">
                  {c.userName && <strong>{c.userName} · </strong>}
                  {date(c.createdAt)}
                </header>
                <div className="issue-markdown">
                  <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN}>{c.body}</Markdown>
                </div>
              </article>
            ))}
          </section>
        )}

        <div className="dialog-actions">
          <button type="button" onClick={() => window.open(issue.url)}>
            {t.linearView.openInLinear}
          </button>
          {feature ? (
            <button type="button" className="primary" onClick={() => onOpenFeature(feature)}>
              {t.linearView.openFeature}
            </button>
          ) : (
            <button type="button" className="primary" disabled={!canStart} onClick={onStart}>
              {t.linearView.startFeature}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
