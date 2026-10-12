import { useEffect, useState, type FormEvent } from 'react'
import {
  PROJECT_COLORS,
  type LinearProject,
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
  const [linearProject, setLinearProject] = useState<LinearProject | null>(project?.linearProject ?? null)
  const [linearProjects, setLinearProjects] = useState<LinearProject[] | null>(null)
  const [linearError, setLinearError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!linear.connected) return
    window.api.linearProjects().then(setLinearProjects, (err) => setLinearError(cleanError(err)))
  }, [linear.connected])

  async function browse() {
    setError('')
    const picked = await window.api.pickProjectFolder()
    if (!picked) return
    if (picked.existingProjectId) return onExisting(picked.existingProjectId)
    setRepo(picked)
    setName(picked.name)
  }

  const path = project?.path ?? repo?.path ?? ''
  const ready = Boolean(name.trim()) && (project ? true : Boolean(repo?.isGit))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError('')
    try {
      const patch = { name, color, linearProject }
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

  // A linked project that no longer shows up in Linear still has to stay selectable.
  const options = [
    ...(linearProject && !linearProjects?.some((p) => p.id === linearProject.id) ? [linearProject] : []),
    ...(linearProjects ?? [])
  ]

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
            <p className="repo-state bad">
              <span className="dot error" /> {t.project.notGit}
            </p>
          ))}

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

        <label htmlFor="pd-linear">{t.project.linearProject}</label>
        {!linear.connected ? (
          <p className="hint">{t.project.linearNotConnected}</p>
        ) : linearError ? (
          <p className="form-error">{linearError}</p>
        ) : (
          <>
            <select
              id="pd-linear"
              value={linearProject?.id ?? ''}
              disabled={!linearProjects}
              onChange={(e) => setLinearProject(options.find((p) => p.id === e.target.value) ?? null)}
            >
              <option value="">{linearProjects ? t.project.linearNone : t.project.loading}</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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
