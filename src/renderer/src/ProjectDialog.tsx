import { useEffect, useState, type FormEvent } from 'react'
import {
  PROJECT_COLORS,
  type LinearLabel,
  type LinearStatus,
  type Project,
  type RepoInfo
} from '../../shared/types'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'

interface Props {
  /** Present when editing; absent when creating. */
  project?: Project
  linear: LinearStatus
  onClose(): void
  onSaved(project: Project): void
  /** The picked folder already belongs to a project: show that one instead. */
  onExisting(projectId: string): void
}

export function ProjectDialog({ project, linear, onClose, onSaved, onExisting }: Props) {
  const t = useT()
  const [repo, setRepo] = useState<RepoInfo | null>(null)
  const [name, setName] = useState(project?.name ?? '')
  const [color, setColor] = useState<string>(project?.color ?? PROJECT_COLORS[0])
  /** Labels ticked for this repository. */
  const [chosen, setChosen] = useState<LinearLabel[]>(project?.linearLabels ?? [])
  /** Every label of the workspace; null while loading. */
  const [linearLabels, setLinearLabels] = useState<LinearLabel[] | null>(null)
  const [labelFilter, setLabelFilter] = useState('')
  const [linearError, setLinearError] = useState('')
  const [worktrees, setWorktrees] = useState(project?.worktrees ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!linear.connected) return
    window.api.linearProjectLabels().then(setLinearLabels, (err) => setLinearError(cleanError(err)))
  }, [linear.connected])

  async function browse() {
    setError('')
    const picked = await window.api.pickProjectFolder()
    if (!picked) return
    if (picked.existingProjectId) return onExisting(picked.existingProjectId)
    setRepo(picked)
    setName(picked.name)
    setWorktrees(picked.isGit)
  }

  const path = project?.path ?? repo?.path ?? ''
  const ready = Boolean(name.trim()) && (project ? true : Boolean(repo))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError('')
    try {
      const patch = { name, color, linearLabels: chosen, worktrees }
      onSaved(
        project
          ? await window.api.updateProject(project.id, patch)
          : await window.api.createProject({ path, ...patch })
      )
    } catch (err) {
      setError(cleanError(err))
      setBusy(false)
    }
  }

  // A linked label that no longer shows up in Linear still has to stay selectable.
  const options = [...chosen.filter((c) => !linearLabels?.some((l) => l.id === c.id)), ...(linearLabels ?? [])]
  const visible = options.filter((l) => l.name.toLowerCase().includes(labelFilter.trim().toLowerCase()))
  const toggleLabel = (label: LinearLabel) =>
    setChosen((list) => (list.some((l) => l.id === label.id) ? list.filter((l) => l.id !== label.id) : [...list, label]))

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" onSubmit={submit}>
        <h2>{project ? t.project.settingsTitle : t.project.newTitle}</h2>

        <label>{t.project.folder}</label>
        <div className="row">
          <input className="mono" value={path} readOnly placeholder={t.project.folderPlaceholder} />
          {!project && (
            <button type="button" onClick={browse}>
              {t.project.browse}
            </button>
          )}
        </div>
        {repo &&
          (repo.isGit ? (
            <p className="repo-state ok">
              <span className="dot done" /> {t.project.gitDetected(repo.branch, repo.changedFiles)}
            </p>
          ) : (
            <p className="repo-state">
              <span className="dot still" /> {t.project.notGit}
            </p>
          ))}

        {/* Only a git repository can host worktrees; the main process refuses them for any other folder. */}
        {(project || repo?.isGit) && (
          <>
            <label className="settings-check">
              <input type="checkbox" checked={worktrees} onChange={(e) => setWorktrees(e.target.checked)} />
              {t.project.useWorktrees}
            </label>
            <p className="hint">{t.project.useWorktreesHint}</p>
          </>
        )}

        <div className="row split">
          <div>
            <label htmlFor="pd-name">{t.project.name}</label>
            <input id="pd-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label>{t.project.tabPreview}</label>
            <div className="tab active preview" style={{ '--tab-color': color } as React.CSSProperties}>
              <span className="swatch" />
              <span className="tab-name">{name || t.project.fallbackName}</span>
            </div>
          </div>
        </div>

        <label>{t.project.color}</label>
        <div className="swatches">
          {PROJECT_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className={`swatch-pick${c === color ? ' selected' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`${t.project.color} ${c}`}
            />
          ))}
        </div>

        {/* Linear is optional: the section only exists for those who connected it. */}
        {linear.connected && <label htmlFor="pd-linear-filter">{t.project.linearLabel}</label>}
        {!linear.connected ? null : linearError ? (
          <p className="form-error">{linearError}</p>
        ) : (
          <>
            {options.length > 6 && (
              <input id="pd-linear-filter" value={labelFilter} placeholder={t.project.linearFilter} onChange={(e) => setLabelFilter(e.target.value)} />
            )}
            <div className="label-list" role="group" aria-label={t.project.linearLabel}>
              {!linearLabels && <p className="hint">{t.project.loading}</p>}
              {linearLabels && !options.length && <p className="hint">{t.project.linearNone}</p>}
              {visible.map((l) => (
                <label key={l.id} className="label-option">
                  <input type="checkbox" checked={chosen.some((c) => c.id === l.id)} onChange={() => toggleLabel(l)} />
                  {l.name}
                </label>
              ))}
            </div>
            <p className="hint">{t.project.linearHint}</p>
          </>
        )}

        {error && <p className="form-error">{error}</p>}

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="submit" className="primary" disabled={!ready || busy}>
            {project ? t.common.save : t.project.create}
          </button>
        </div>
      </form>
    </div>
  )
}
