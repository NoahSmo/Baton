import { useEffect, useState, type FormEvent } from 'react'
import { issuePrompt } from '../../shared/linear'
import {
  AGENT_MODELS,
  DEFAULT_AGENT_MODEL,
  PERMISSION_MODES,
  type AgentModel,
  type Feature,
  type LinearIssue,
  type PermissionMode,
  type Project
} from '../../shared/types'
import { AttachButton, DraftAttachments } from './Attachments'
import { useT } from './i18n'
import { IssueStateFilter, matchesIssueFilter } from './IssueStateFilter'
import { toMessageAttachments, useAttachments } from './useAttachments'

interface Props {
  project: Project
  /** Repositories to choose from, when the issue does not point at one. */
  repositories?: Project[]
  linearConnected: boolean
  /** Issue to start from, when the dialog is opened from the Linear tab. */
  initialIssue?: LinearIssue
  onClose(): void
  onCreated(feature: Feature): void
}

export function NewFeatureDialog({
  project: initialProject,
  repositories = [],
  linearConnected,
  initialIssue,
  onClose,
  onCreated
}: Props) {
  const t = useT()
  const [project, setProject] = useState(initialProject)
  const [title, setTitle] = useState(initialIssue ? `${initialIssue.identifier} ${initialIssue.title}` : '')
  const [prompt, setPrompt] = useState(initialIssue ? issuePrompt(initialIssue) : '')
  const attachments = useAttachments()
  const [mode, setMode] = useState<PermissionMode>('default')
  const [model, setModel] = useState<AgentModel>(DEFAULT_AGENT_MODEL)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [issues, setIssues] = useState<LinearIssue[] | null>(null)
  const [issuesError, setIssuesError] = useState('')
  const [issueFilter, setIssueFilter] = useState('')
  const [stateFilter, setStateFilter] = useState<string[]>([])
  const [issue, setIssue] = useState<LinearIssue | null>(initialIssue ?? null)

  const linearLabel = project.linearLabel

  useEffect(() => {
    // A repository linked to a Linear label starts its agents from the issues of that label;
    // any other gets a title and a prompt written by hand.
    if (!linearConnected || !linearLabel) return
    let stale = false
    setIssues(null)
    setIssuesError('')
    window.api.linearLabelIssues(linearLabel.id).then(
      (list) => !stale && setIssues(list),
      (err) => !stale && setIssuesError(cleanError(err))
    )
    return () => {
      stale = true
    }
  }, [linearConnected, linearLabel?.id])

  function pickIssue(picked: LinearIssue) {
    setIssue(picked)
    setTitle(`${picked.identifier} ${picked.title}`)
    setPrompt(issuePrompt(picked))
  }

  const shownIssues = (issues ?? []).filter((i) => matchesIssueFilter(i, stateFilter, issueFilter))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const input = {
        projectId: project.id,
        title,
        prompt,
        attachments: toMessageAttachments(attachments.drafts),
        permissionMode: mode,
        agentModel: model,
        ...(issue ? { linearIssue: issue } : {})
      }
      onCreated(await window.api.createFeature(input))
    } catch (err) {
      setError(cleanError(err))
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" onSubmit={submit}>
        <h2>
          {t.newFeature.title} <span className="dialog-context">{t.newFeature.inProject(project.name)}</span>
        </h2>

        {repositories.length > 1 && (
          <>
            <label htmlFor="nf-repo">{t.linearView.repository}</label>
            <select
              id="nf-repo"
              value={project.id}
              onChange={(e) => setProject(repositories.find((p) => p.id === e.target.value) ?? project)}
            >
              {repositories.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        )}

        {linearConnected && (linearLabel || issue) && (
          <>
            <label>{linearLabel ? t.newFeature.issueOf(linearLabel.name) : t.newFeature.linearIssue}</label>
            {issue ? (
              <div className="issue-picked">
                <span className="issue-id">{issue.identifier}</span>
                <span className="issue-title">{issue.title}</span>
                <button type="button" onClick={() => setIssue(null)}>
                  {t.newFeature.unlink}
                </button>
              </div>
            ) : issuesError ? (
              <p className="form-error">{issuesError}</p>
            ) : !issues ? (
              <p className="hint">{t.newFeature.loadingIssues}</p>
            ) : (
              <>
                <input
                  value={issueFilter}
                  onChange={(e) => setIssueFilter(e.target.value)}
                  placeholder={t.newFeature.filterIssues}
                />
                <IssueStateFilter issues={issues} selected={stateFilter} onChange={setStateFilter} />
                <div className="issue-list">
                  {shownIssues.map((i) => (
                    <button type="button" key={i.id} className="issue-row" onClick={() => pickIssue(i)}>
                      <span className="issue-id">{i.identifier}</span>
                      <span className="issue-title">{i.title}</span>
                      <span className="issue-state">{i.stateName}</span>
                    </button>
                  ))}
                  {!shownIssues.length && linearLabel && (
                    <p className="hint">{t.newFeature.noIssueIn(linearLabel.name)}</p>
                  )}
                </div>
              </>
            )}
          </>
        )}

        <label htmlFor="nf-title">{t.newFeature.titleLabel}</label>
        <input
          id="nf-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.newFeature.titlePlaceholder}
        />

        <label htmlFor="nf-prompt">{t.newFeature.promptLabel}</label>
        <textarea
          id="nf-prompt"
          rows={6}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onPaste={attachments.onPaste}
          onDragOver={attachments.onDragOver}
          onDrop={attachments.onDrop}
          placeholder={t.newFeature.promptPlaceholder}
        />
        <div className="dialog-attach">
          <AttachButton onPick={(files) => void attachments.add(files)} />
          <DraftAttachments drafts={attachments.drafts} rejected={attachments.rejected} onRemove={attachments.remove} />
        </div>

        <label>{t.newFeature.permissions}</label>
        <div className="modes">
          {PERMISSION_MODES.map((m) => (
            <button
              type="button"
              key={m}
              className={`mode${mode === m ? ' selected' : ''}`}
              onClick={() => setMode(m)}
              title={t.modes[m].hint}
            >
              {t.modes[m].label}
            </button>
          ))}
        </div>
        <p className="hint">{t.modes[mode].hint}</p>

        <label>{t.newFeature.model}</label>
        <div className="modes">
          {AGENT_MODELS.map((m) => (
            <button
              type="button"
              key={m}
              className={`mode${model === m ? ' selected' : ''}`}
              onClick={() => setModel(m)}
              title={t.models[m].hint}
            >
              {t.models[m].label}
            </button>
          ))}
        </div>
        <p className="hint">{t.models[model].hint}</p>

        {error && <p className="form-error">{error}</p>}

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="submit" className="primary" disabled={!title.trim() || busy}>
            {busy ? t.newFeature.creating : t.newFeature.create}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Strips the "Error invoking remote method …: Error:" prefix Electron adds to IPC failures. */
export function cleanError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
