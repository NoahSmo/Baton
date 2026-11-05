import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'
import {
  PROJECT_COLORS,
  type LinearProject,
  type LinearProjectLink,
  type LinearStatus,
  type Project,
  type RepoInfo
} from '../../shared/types'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'
import { ProjectAvatar } from './ProjectRail'
import { Icon } from './ui/Icon'

interface Props {
  /** Present when editing; absent when creating. */
  project?: Project
  linear: LinearStatus
  onClose(): void
  onSaved(project: Project): void
  /** The picked folder already belongs to a project: show that one instead. */
  onExisting(projectId: string): void
}

const IMAGE_SIZE = 128

/** Center-crops a picture to a small square PNG, so it stays cheap to store and to paint in the rail. */
async function toAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = IMAGE_SIZE
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, IMAGE_SIZE, IMAGE_SIZE)
  bitmap.close()
  return canvas.toDataURL('image/png')
}

export function ProjectDialog({ project, linear, onClose, onSaved, onExisting }: Props) {
  const t = useT()
  const [repo, setRepo] = useState<RepoInfo | null>(null)
  const [name, setName] = useState(project?.name ?? '')
  const [color, setColor] = useState<string>(project?.color ?? PROJECT_COLORS[0])
  const [image, setImage] = useState<string | null>(project?.image ?? null)
  const [dragging, setDragging] = useState(false)
  /** Linear projects ticked for this repository. */
  const [chosen, setChosen] = useState<LinearProjectLink[]>(project?.linearProjects ?? [])
  /** Every project of the workspace; null while loading. */
  const [linearProjects, setLinearProjects] = useState<LinearProject[] | null>(null)
  const [labelFilter, setLabelFilter] = useState('')
  const [linearError, setLinearError] = useState('')
  const [worktrees, setWorktrees] = useState(project?.worktrees ?? true)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!linear.connected) return
    window.api.linearProjects().then(setLinearProjects, (err) => setLinearError(cleanError(err)))
  }, [linear.connected])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function browse() {
    setError('')
    const picked = await window.api.pickProjectFolder()
    if (!picked) return
    if (picked.existingProjectId) return onExisting(picked.existingProjectId)
    setRepo(picked)
    setName(picked.name)
    setWorktrees(picked.isGit)
  }

  async function pickImage(file: File | undefined) {
    if (!file) return
    setError('')
    try {
      setImage(await toAvatar(file))
    } catch {
      setError(t.project.imageInvalid)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void pickImage(e.dataTransfer.files[0])
  }

  async function copyPath() {
    await navigator.clipboard.writeText(path)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const path = project?.path ?? repo?.path ?? ''
  const ready = Boolean(name.trim()) && (project ? true : Boolean(repo))

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError('')
    try {
      const patch = { name, color, image, linearProjects: chosen, worktrees }
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
  const visible = useMemo(() => {
    const options: LinearProjectLink[] = [
      ...chosen.filter((c) => !linearProjects?.some((p) => p.id === c.id)),
      ...(linearProjects ?? []).map(({ id, name }) => ({ id, name }))
    ]
    const needle = labelFilter.trim().toLowerCase()
    return { total: options.length, list: options.filter((l) => l.name.toLowerCase().includes(needle)) }
  }, [chosen, linearProjects, labelFilter])
  const toggleLink = (link: LinearProjectLink) =>
    setChosen((list) => (list.some((l) => l.id === link.id) ? list.filter((l) => l.id !== link.id) : [...list, { id: link.id, name: link.name }]))
  const toggleMain = (id: string) => setChosen((list) => list.map((l) => (l.id === id ? { ...l, primary: !l.primary } : l)))

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="dialog project-dialog"
        onSubmit={submit}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && void submit()}
      >
        <h2>{project ? t.project.settingsTitle : t.project.newTitle}</h2>

        <div className="project-body">
          <div className="project-ident">
            <button
              type="button"
              className={`avatar-picker${dragging ? ' dragging' : ''}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              title={t.project.imageChoose}
              aria-label={t.project.imageChoose}
              style={{ '--tab-color': color } as React.CSSProperties}
            >
              <ProjectAvatar name={name || t.project.fallbackName} image={image} />
              <span className="avatar-hint">{t.project.imageDrop}</span>
              {image && (
                <span
                  role="button"
                  className="avatar-clear"
                  title={t.project.imageRemove}
                  aria-label={t.project.imageRemove}
                  onClick={(e) => {
                    e.stopPropagation()
                    setImage(null)
                  }}
                >
                  <Icon name="close" size={10} />
                </span>
              )}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                void pickImage(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <div>
              <label htmlFor="pd-name">{t.project.name}</label>
              <input id="pd-name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
              <div className="path-row">
                <input className="mono" value={path} readOnly placeholder={t.project.folderPlaceholder} title={path} />
                {path && (
                  <button type="button" onClick={copyPath} title={t.project.copyPath} aria-label={t.project.copyPath}>
                    <Icon name={copied ? 'check' : 'code'} size={13} />
                  </button>
                )}
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
            </div>
          </div>

          <div>
            <span className="field-label">{t.project.color}</span>
            <div className="swatches" role="radiogroup" aria-label={t.project.color}>
              {PROJECT_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  role="radio"
                  aria-checked={c === color}
                  className={`swatch-pick${c === color ? ' selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={`${t.project.color} ${c}`}
                />
              ))}
            </div>
          </div>

          {/* Only a git repository can host worktrees; the main process refuses them for any other folder. */}
          {(project || repo?.isGit) && (
            <label className="toggle-row">
              <div>
                {t.project.useWorktrees}
                <p className="hint">{t.project.useWorktreesHint}</p>
              </div>
              <input type="checkbox" checked={worktrees} onChange={(e) => setWorktrees(e.target.checked)} />
            </label>
          )}

          {/* Linear is optional: the section only exists for those who connected it. */}
          {linear.connected && (
            <div>
              <div className="dialog-section-head">
                <label htmlFor="pd-linear-filter">
                  {t.project.linearLabel}
                  {chosen.length > 0 && ` · ${t.project.labelsSelected(chosen.length)}`}
                </label>
                {chosen.length > 0 && (
                  <button type="button" onClick={() => setChosen([])}>
                    {t.project.clearLabels}
                  </button>
                )}
              </div>
              {linearError ? (
                <p className="form-error">{linearError}</p>
              ) : (
                <>
                  {visible.total > 6 && (
                    <input
                      id="pd-linear-filter"
                      value={labelFilter}
                      placeholder={t.project.linearFilter}
                      onChange={(e) => setLabelFilter(e.target.value)}
                      style={{ marginBottom: 6 }}
                    />
                  )}
                  <div className="label-list" role="group" aria-label={t.project.linearLabel}>
                    {!linearProjects && <p className="hint">{t.project.loading}</p>}
                    {linearProjects && !visible.total && <p className="hint">{t.project.linearNone}</p>}
                    {visible.list.map((l) => {
                      const link = chosen.find((c) => c.id === l.id)
                      return (
                        <div key={l.id} className="label-option">
                          <label>
                            <input type="checkbox" checked={!!link} onChange={() => toggleLink(l)} />
                            {l.name}
                          </label>
                          {link && (
                            <button
                              type="button"
                              className={`filter${link.primary ? ' selected' : ''}`}
                              aria-pressed={!!link.primary}
                              title={t.project.mainRepoHint}
                              onClick={() => toggleMain(l.id)}
                            >
                              {t.project.mainRepo}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p className="hint">{t.project.linearHint}</p>
                </>
              )}
            </div>
          )}

          {error && <p className="form-error">{error}</p>}
        </div>

        <div className="dialog-actions">
          <span className="kbd-hint">{t.project.saveHint}</span>
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
