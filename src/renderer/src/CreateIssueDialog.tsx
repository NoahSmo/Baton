import { useState, type FormEvent } from 'react'
import type { LinearIssue, LinearProject, LinearTeam } from '../../shared/types'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'
import { DialogClose } from './DialogClose'

interface Props {
  linearProjects: LinearProject[]
  /** Project the issue goes in at first: the one shown in the Linear tab. */
  initialProjectId: string | null
  onClose(): void
  onCreated(issue: LinearIssue): void
}

/** Teams an issue outside any project can go in: every team the workspace's projects belong to. */
function allTeams(projects: readonly LinearProject[]): LinearTeam[] {
  const teams = new Map<string, LinearTeam>()
  for (const p of projects) for (const team of p.teams) teams.set(team.id, team)
  return [...teams.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Creates a Linear issue from the Linear tab, assigned to the connected user. */
export function CreateIssueDialog({ linearProjects, initialProjectId, onClose, onCreated }: Props) {
  const t = useT()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState(initialProjectId ?? '')
  const [teamId, setTeamId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const project = linearProjects.find((p) => p.id === projectId)
  const teams = project ? project.teams : allTeams(linearProjects)
  const team = teams.find((tm) => tm.id === teamId) ?? teams[0]

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !team || busy) return
    setBusy(true)
    setError('')
    try {
      onCreated(
        await window.api.linearCreateIssue({
          title: title.trim(),
          description: description.trim(),
          teamId: team.id,
          ...(project ? { projectId: project.id } : {})
        })
      )
    } catch (err) {
      setError(cleanError(err))
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" onSubmit={submit}>
        <DialogClose onClose={onClose} />
        <h2>{t.linearView.newIssueTitle}</h2>

        <label htmlFor="ci-title">{t.newFeature.titleLabel}</label>
        <input id="ci-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />

        <label htmlFor="ci-description">{t.linearView.newIssueDescription}</label>
        <textarea
          id="ci-description"
          rows={6}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t.linearView.newIssueDescriptionPlaceholder}
        />

        <label htmlFor="ci-project">{t.newFeature.newIssueProject}</label>
        <select id="ci-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">{t.linearView.newIssueNoProject}</option>
          {linearProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {teams.length > 1 && (
          <>
            <label htmlFor="ci-team">{t.newFeature.newIssueTeam}</label>
            <select id="ci-team" value={team?.id} onChange={(e) => setTeamId(e.target.value)}>
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                </option>
              ))}
            </select>
          </>
        )}
        {team ? <p className="hint">{t.linearView.newIssueHint}</p> : <p className="hint">{t.newFeature.newIssueNoTeam}</p>}

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button type="submit" className="primary" disabled={!title.trim() || !team || busy}>
            {busy ? t.newFeature.newIssueCreating : t.newFeature.newIssueCreate}
          </button>
        </div>
      </form>
    </div>
  )
}
