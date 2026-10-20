import { useEffect, useState } from 'react'
import { BOARD_GROUPINGS, stateForColumn, type BoardGrouping, type KanbanColumn } from '../../shared/kanban'
import { issuePrompt } from '../../shared/linear'
import { DEFAULT_AGENT_MODEL, type Feature, type LinearIssue, type LinearProject, type LinearState, type LinearStatus, type Project } from '../../shared/types'
import { openContextMenu } from './contextMenu'
import { useT } from './i18n'
import { IssueStateFilter, matchesIssueFilter } from './IssueStateFilter'
import { KanbanBoard } from './KanbanBoard'
import { cleanError } from './NewFeatureDialog'
import { usePersisted } from './usePersisted'

interface Props {
  linear: LinearStatus
  projects: Project[]
  features: Feature[]
  /** Repository used for an issue that points at none (or several). */
  defaultProjectId: string | null
  onConnect(): void
  /** `repos` are the repositories the issue's labels point at; with none or several, the user picks. */
  onStart(issue: LinearIssue, repos: Project[]): void
  onOpenFeature(feature: Feature): void
  /** An agent was started from each selected issue. */
  onStarted(features: Feature[]): void
}

export function LinearView({ linear, projects, features, defaultProjectId, onConnect, onStart, onOpenFeature, onStarted }: Props) {
  const t = useT()
  const [linearProjects, setLinearProjects] = useState<LinearProject[] | null>(null)
  /** Selected Linear project; null shows the issues assigned to the user. */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [issues, setIssues] = useState<LinearIssue[] | null>(null)
  const [teamStates, setTeamStates] = useState<Record<string, LinearState[]>>({})
  const [stateFilter, setStateFilter] = useState<string[]>([])
  const [view, setView] = usePersisted<'list' | 'board'>('linear-view', 'list', ['list', 'board'])
  const [grouping, setGrouping] = usePersisted<BoardGrouping>('linear-board-grouping', 'status', BOARD_GROUPINGS)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [selection, setSelection] = useState<string[]>([])
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!linear.connected) return
    window.api.linearProjects().then(setLinearProjects, (err) => setError(cleanError(err)))
  }, [linear.connected, reload])

  useEffect(() => {
    if (!linear.connected) return
    let stale = false
    setIssues(null)
    setSelection([])
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

  /** Repositories linked to one of the labels the Linear project carries. */
  const reposFor = (linearProjectId: string | null) => {
    const labels = linearProjects?.find((p) => p.id === linearProjectId)?.labels ?? []
    return projects.filter((p) => labels.some((l) => l.id === p.linearLabel?.id))
  }
  const selectedProject = linearProjects?.find((p) => p.id === selectedId) ?? null

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

  /** A card dropped on a column: the issue takes that status or priority, undone if Linear refuses. */
  async function moveIssue(issue: LinearIssue, column: KanbanColumn) {
    setError('')
    const patch = (next: Partial<LinearIssue>) =>
      setIssues((list) => list?.map((i) => (i.id === issue.id ? { ...i, ...next } : i)) ?? null)
    if (column.priority !== undefined) {
      if (column.priority === issue.priority) return
      patch({ priority: column.priority })
      try {
        await window.api.linearSetIssuePriority(issue.id, column.priority)
      } catch (err) {
        patch({ priority: issue.priority })
        setError(cleanError(err))
      }
      return
    }
    if (column.key === issue.stateName) return
    const state = stateForColumn(teamStates[issue.teamId] ?? [], column)
    if (!state) return setError(t.linearView.noStateInTeam(column.key))
    await changeState(issue, state.id)
  }

  const shown = (issues ?? []).filter((i) => matchesIssueFilter(i, stateFilter, text))
  const hasFeature = (issue: LinearIssue) => features.some((f) => f.linear?.issueId === issue.id)
  const startable = shown.filter((i) => !hasFeature(i))
  const picked = (issues ?? []).filter((i) => selection.includes(i.id) && !hasFeature(i))
  const allPicked = startable.length > 0 && startable.every((i) => selection.includes(i.id))

  const toggle = (id: string) => setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  /** The only repository the issue points at, else the one being worked in. */
  function repoFor(issue: LinearIssue): Project {
    const repos = reposFor(issue.linearProjectId)
    if (repos.length === 1) return repos[0]
    const candidates = repos.length ? repos : projects
    return candidates.find((p) => p.id === defaultProjectId) ?? candidates[0]
  }

  /** One agent per selected issue, with the default settings; failures stay selected. */
  async function startSelected() {
    if (!picked.length || starting) return
    setStarting(true)
    setError('')
    const started: Feature[] = []
    const failed: string[] = []
    let lastError = ''
    for (const issue of picked) {
      try {
        started.push(
          await window.api.createFeature({
            projectId: repoFor(issue).id,
            title: `${issue.identifier} ${issue.title}`,
            prompt: issuePrompt(issue),
            permissionMode: 'default',
            agentModel: DEFAULT_AGENT_MODEL,
            linearIssue: issue
          })
        )
      } catch (err) {
        failed.push(issue.id)
        lastError = cleanError(err)
      }
    }
    setStarting(false)
    setSelection(failed)
    if (failed.length) setError(lastError)
    if (started.length) onStarted(started)
  }

  return (
    <main className="main wide linear-view">
      <aside className="linear-projects">
        <button className={`linear-project${selectedId === null ? ' selected' : ''}`} onClick={() => setSelectedId(null)}>
          <span className="linear-project-name">{t.linearView.myIssues}</span>
        </button>
        <h2 className="sidebar-title">{t.linearView.projects}</h2>
        {!linearProjects && <p className="hint">{t.project.loading}</p>}
        {linearProjects?.map((p) => {
          const repos = reposFor(p.id)
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
              {repos.map((repo) => (
                <span
                  key={repo.id}
                  className="linear-project-repo"
                  style={{ '--tab-color': repo.color } as React.CSSProperties}
                >
                  <span className="swatch" /> {repo.name}
                </span>
              ))}
            </button>
          )
        })}
      </aside>

      <section className="linear-issues">
        <header className="linear-head">
          <div className="linear-head-main">
            <h1>{selectedProject?.name ?? t.linearView.myIssues}</h1>
            <p className="feature-meta">
              {[
                issues ? t.linearView.issues(issues.length) : t.project.loading,
                ...(selectedProject?.labels.map((l) => l.name) ?? [])
              ].join(' · ')}
            </p>
          </div>
          <div className="filters" role="group">
            {(['list', 'board'] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={`filter${view === v ? ' selected' : ''}`}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {t.linearView[v]}
              </button>
            ))}
          </div>
          {view === 'board' && (
            <div className="filters" role="group">
              {BOARD_GROUPINGS.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`filter${grouping === g ? ' selected' : ''}`}
                  aria-pressed={grouping === g}
                  onClick={() => setGrouping(g)}
                >
                  {g === 'status' ? t.linearView.groupByStatus : t.linearView.groupByPriority}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setReload((n) => n + 1)}>{t.linearView.refresh}</button>
        </header>

        <div className="linear-tools">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.newFeature.filterIssues} />
          {issues && <IssueStateFilter issues={issues} selected={stateFilter} onChange={setStateFilter} />}
        </div>

        {startable.length > 0 && (
          <div className="linear-bulk">
            <label className="linear-check">
              <input
                type="checkbox"
                checked={allPicked}
                onChange={() =>
                  setSelection((s) =>
                    allPicked ? s.filter((id) => !startable.some((i) => i.id === id)) : [...new Set([...s, ...startable.map((i) => i.id)])]
                  )
                }
              />
              {t.linearView.selectAll}
            </label>
            {picked.length > 0 && (
              <>
                <span className="hint">{t.linearView.selected(picked.length)}</span>
                <button className="primary" disabled={starting || !projects.length} onClick={() => void startSelected()}>
                  {starting ? t.linearView.startingMany : t.linearView.startMany(picked.length)}
                </button>
              </>
            )}
          </div>
        )}

        {error && <p className="form-error linear-error">{error}</p>}
        {selectedProject && !reposFor(selectedId).length && projects.length > 1 && (
          <p className="hint linear-hint">{t.linearView.needRepository}</p>
        )}

        {view === 'board' && issues && (
          <KanbanBoard
            issues={shown}
            teamStates={teamStates}
            grouping={grouping}
            projects={projects}
            features={features}
            reposFor={reposFor}
            onMove={(issue, column) => void moveIssue(issue, column)}
            onStart={onStart}
            onOpenFeature={onOpenFeature}
          />
        )}

        {view === 'list' && (
        <div className="linear-list">
          {shown.map((issue) => {
            const feature = features.find((f) => f.linear?.issueId === issue.id)
            const repos = reposFor(issue.linearProjectId)
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
                <input
                  type="checkbox"
                  className="linear-check"
                  aria-label={issue.identifier}
                  disabled={!!feature || starting}
                  checked={!feature && selection.includes(issue.id)}
                  onChange={() => toggle(issue.id)}
                />
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
                    disabled={!projects.length}
                    title={projects.length ? repos.map((r) => r.name).join(', ') || undefined : t.linearView.needProject}
                    onClick={() => onStart(issue, repos)}
                  >
                    {t.linearView.startFeature}
                  </button>
                )}
              </div>
            )
          })}
          {issues && !shown.length && <p className="hint linear-hint">{t.linearView.noIssues}</p>}
        </div>
        )}
      </section>
    </main>
  )
}
