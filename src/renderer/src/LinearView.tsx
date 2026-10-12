import { useEffect, useState } from 'react'
import type { Feature, LinearIssue, LinearProject, LinearState, LinearStatus, Project } from '../../shared/types'
import { openContextMenu } from './contextMenu'
import { useT } from './i18n'
import { IssueStateFilter, matchesIssueFilter } from './IssueStateFilter'
import { cleanError } from './NewFeatureDialog'

interface Props {
  linear: LinearStatus
  projects: Project[]
  features: Feature[]
  onConnect(): void
  onStart(project: Project, issue: LinearIssue): void
  onOpenFeature(feature: Feature): void
  onProjectChanged(project: Project): void
}

export function LinearView({ linear, projects, features, onConnect, onStart, onOpenFeature, onProjectChanged }: Props) {
  const t = useT()
  const [linearProjects, setLinearProjects] = useState<LinearProject[] | null>(null)
  /** Selected Linear project; null shows the issues assigned to the user. */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [issues, setIssues] = useState<LinearIssue[] | null>(null)
  const [teamStates, setTeamStates] = useState<Record<string, LinearState[]>>({})
  const [stateFilter, setStateFilter] = useState<string[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!linear.connected) return
    window.api.linearProjects().then(setLinearProjects, (err) => setError(cleanError(err)))
  }, [linear.connected, reload])

  useEffect(() => {
    if (!linear.connected) return
    let stale = false
    setIssues(null)
    setError('')
    window.api.linearIssues(selectedId ?? undefined).then(
      (list) => !stale && setIssues(list),
      (err) => !stale && setError(cleanError(err))
    )
    return () => {
      stale = true
    }
  }, [linear.connected, selectedId, reload])

  // The state menu of an issue lists the workflow of its team.
  useEffect(() => {
    for (const teamId of new Set((issues ?? []).map((i) => i.teamId))) {
      if (teamStates[teamId]) continue
      void window.api.linearTeamStates(teamId).then(
        (states) => setTeamStates((all) => ({ ...all, [teamId]: states })),
        () => {}
      )
    }
  }, [issues, teamStates])

  if (!linear.connected) {
    return (
      <main className="main wide">
        <div className="empty">
          <h1>{t.linearView.notConnectedTitle}</h1>
          <p>{t.linearView.notConnectedBody}</p>
          <button className="primary" onClick={onConnect}>
            {t.statusbar.connectLinear}
          </button>
        </div>
      </main>
    )
  }

  const repoFor = (linearProjectId: string | null) =>
    linearProjectId ? projects.find((p) => p.linearProject?.id === linearProjectId) : undefined
  const selectedProject = linearProjects?.find((p) => p.id === selectedId) ?? null
  const selectedRepo = repoFor(selectedId)

  async function linkRepo(repoId: string) {
    if (!selectedProject) return
    setError('')
    try {
      // One repository per Linear project: starting a feature must know where to go.
      if (selectedRepo && selectedRepo.id !== repoId) {
        const { name, color } = selectedRepo
        onProjectChanged(await window.api.updateProject(selectedRepo.id, { name, color, linearProject: null }))
      }
      const repo = projects.find((p) => p.id === repoId)
      if (repo) {
        const { name, color } = repo
        onProjectChanged(await window.api.updateProject(repo.id, { name, color, linearProject: selectedProject }))
      }
    } catch (err) {
      setError(cleanError(err))
    }
  }

  async function changeState(issue: LinearIssue, stateId: string) {
    const state = teamStates[issue.teamId]?.find((s) => s.id === stateId)
    if (!state) return
    const patch = (next: Pick<LinearIssue, 'stateId' | 'stateName' | 'stateType'>) =>
      setIssues((list) => list?.map((i) => (i.id === issue.id ? { ...i, ...next } : i)) ?? null)
    patch({ stateId: state.id, stateName: state.name, stateType: state.type })
    setError('')
    try {
      await window.api.linearSetIssueState(issue.id, stateId)
    } catch (err) {
      patch(issue)
      setError(cleanError(err))
    }
  }

  const shown = (issues ?? []).filter((i) => matchesIssueFilter(i, stateFilter, text))

  return (
    <main className="main wide linear-view">
      <aside className="linear-projects">
        <button className={`linear-project${selectedId === null ? ' selected' : ''}`} onClick={() => setSelectedId(null)}>
          <span className="linear-project-name">{t.linearView.myIssues}</span>
        </button>
        <h2 className="sidebar-title">{t.linearView.projects}</h2>
        {!linearProjects && <p className="hint">{t.project.loading}</p>}
        {linearProjects?.map((p) => {
          const repo = repoFor(p.id)
          return (
            <button
              key={p.id}
              className={`linear-project${selectedId === p.id ? ' selected' : ''}`}
              onClick={() => {
                setSelectedId(p.id)
                setStateFilter([])
              }}
            >
              <span className="linear-project-name">{p.name}</span>
              {repo && (
                <span className="linear-project-repo" style={{ '--tab-color': repo.color } as React.CSSProperties}>
                  <span className="swatch" /> {repo.name}
                </span>
              )}
            </button>
          )
        })}
      </aside>

      <section className="linear-issues">
        <header className="linear-head">
          <div className="linear-head-main">
            <h1>{selectedProject?.name ?? t.linearView.myIssues}</h1>
            <p className="feature-meta">{issues ? t.linearView.issues(issues.length) : t.project.loading}</p>
          </div>
          {selectedProject && (
            <label className="linear-repo">
              {t.linearView.repository}
              <select value={selectedRepo?.id ?? ''} onChange={(e) => void linkRepo(e.target.value)}>
                <option value="">{t.linearView.noRepository}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button onClick={() => setReload((n) => n + 1)}>{t.linearView.refresh}</button>
        </header>

        <div className="linear-tools">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.newFeature.filterIssues} />
          {issues && <IssueStateFilter issues={issues} selected={stateFilter} onChange={setStateFilter} />}
        </div>

        {error && <p className="form-error linear-error">{error}</p>}
        {selectedProject && !selectedRepo && <p className="hint linear-hint">{t.linearView.needRepository}</p>}

        <div className="linear-list">
          {shown.map((issue) => {
            const feature = features.find((f) => f.linear?.issueId === issue.id)
            const repo = repoFor(selectedId ?? issue.linearProjectId)
            const states = teamStates[issue.teamId]
            return (
              <div
                key={issue.id}
                className="linear-row"
                onContextMenu={(e) => {
                  const { identifier, url, branchName } = issue
                  void openContextMenu(e, { kind: 'issue', identifier, url, branchName })
                }}
              >
                <a className="issue-id" href={issue.url} target="_blank" rel="noreferrer">
                  {issue.identifier}
                </a>
                <span className="issue-title" title={issue.title}>
                  {issue.title}
                </span>
                <span className="linear-assignee">{issue.assigneeName ?? t.linearView.unassigned}</span>
                <select
                  className="linear-state"
                  value={issue.stateId}
                  disabled={!states}
                  onChange={(e) => void changeState(issue, e.target.value)}
                >
                  {(states ?? [{ id: issue.stateId, name: issue.stateName }]).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {feature ? (
                  <button className="linear-action" onClick={() => onOpenFeature(feature)}>
                    {t.linearView.openFeature}
                  </button>
                ) : (
                  <button
                    className="linear-action primary"
                    disabled={!repo}
                    title={repo ? repo.name : t.linearView.needRepository}
                    onClick={() => repo && onStart(repo, issue)}
                  >
                    {t.linearView.startFeature}
                  </button>
                )}
              </div>
            )
          })}
          {issues && !shown.length && <p className="hint linear-hint">{t.linearView.noIssues}</p>}
        </div>
      </section>
    </main>
  )
}
