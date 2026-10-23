import { useEffect, useRef, useState } from 'react'
import { arrangeFeatures, SIDEBAR_SORTS, type SidebarSort } from '../../shared/features'
import type { Feature, FeatureStatus, Project, QaRun, TerminalTarget } from '../../shared/types'
import { openContextMenu } from './contextMenu'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'
import { closeTerminal, inTarget, openTerminal, showTerminal, useTerminals } from './terminalStore'

/** Order of the filter chips: what needs the user first. */
const STATUS_ORDER: FeatureStatus[] = ['waiting', 'working', 'queued', 'done', 'error', 'limited', 'idle']

/** "claude-opus-5-5" reads better as "opus-5-5" in a narrow column. */
function shortModel(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d{8}$/, '')
}

interface Props {
  project: Project
  features: Feature[]
  selectedId: string | null
  onSelect(feature: Feature): void
  onNew(): void
  /** Opens the dialog linking an agent to an issue. */
  onLink(feature: Feature): void
  onEditProject(): void
  onEditCommands(): void
  /** Opens the tests' settings and reports. */
  onOpenQa(): void
  qaRuns: QaRun[]
  onEditTemplates(): void
  /** Opens the dialog starting a new agent from this one's work. */
  onContinue(feature: Feature): void
  query: string
  onQuery(query: string): void
  statuses: FeatureStatus[]
  onStatuses(statuses: FeatureStatus[]): void
  sort: SidebarSort
  onSort(sort: SidebarSort): void
  /** Brings the terminal panel up. */
  onShowTerminal(): void
  linearConnected: boolean
}

export function Sidebar({
  project,
  features,
  selectedId,
  onSelect,
  onNew,
  onLink,
  onEditProject,
  onEditCommands,
  onOpenQa,
  qaRuns,
  onEditTemplates,
  onContinue,
  query,
  onQuery,
  statuses,
  onStatuses,
  sort,
  onSort,
  onShowTerminal,
  linearConnected
}: Props) {
  const t = useT()
  // Terminals belong to the feature on screen, as in the panel; without one they are the project's.
  const target: TerminalTarget = selectedId ? { featureId: selectedId } : { projectId: project.id }
  const terminals = useTerminals().filter((tab) => inTarget(tab.info, target))
  const [terminalError, setTerminalError] = useState<string | null>(null)

  /** The terminal a launch command was started in, while it stays open. */
  const running = (commandId: string) => terminals.find((tab) => tab.info.commandId === commandId)
  // Runs come newest first: the first of a feature is the one that counts.
  const latestQa = qaRuns.filter((r, i) => qaRuns.findIndex((x) => x.featureId === r.featureId) === i)
  const idle = project.commands.filter((c) => !running(c.id))

  /** Opens a shell, or one terminal per launch command given. */
  async function startTerminal(...commandIds: string[]) {
    setTerminalError(null)
    try {
      // Opened before the panel shows: an empty panel starts a shell of its own.
      if (!commandIds.length) await openTerminal(target)
      for (const id of commandIds) await openTerminal(target, id)
      onShowTerminal()
    } catch (err) {
      setTerminalError(t.terminal.failed(cleanError(err)))
    }
  }
  const search = useRef<HTMLInputElement>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  async function openMenu(e: React.MouseEvent, feature: Feature) {
    const action = await openContextMenu(e, { kind: 'feature', featureId: feature.id })
    if (action === 'rename-feature') setRenamingId(feature.id)
    if (action === 'link-feature') onLink(feature)
    if (action === 'continue-feature') onContinue(feature)
  }

  // The search shortcut lives in the app; the field is here.
  useEffect(() => {
    const focus = () => {
      search.current?.focus()
      search.current?.select()
    }
    window.addEventListener('baton:search-sidebar', focus)
    return () => window.removeEventListener('baton:search-sidebar', focus)
  }, [])

  function commitRename(feature: Feature, title: string) {
    setRenamingId(null)
    if (title.trim() && title.trim() !== feature.title) void window.api.renameFeature(feature.id, title)
  }

  const counts = new Map<FeatureStatus, number>()
  for (const f of features) counts.set(f.status, (counts.get(f.status) ?? 0) + 1)
  const present = STATUS_ORDER.filter((s) => counts.has(s))
  // A filtered status can empty out (features change state, tabs change): ignore it rather than show nothing.
  const active = statuses.filter((s) => counts.has(s))
  const { shown, archived } = arrangeFeatures(features, { query, statuses, sort })

  const toggle = (status: FeatureStatus) =>
    onStatuses(active.includes(status) ? active.filter((s) => s !== status) : [...active, status])

  function row(f: Feature) {
    return (
      <div
        key={f.id}
        role="button"
        tabIndex={0}
        className={`feature-row${f.id === selectedId ? ' selected' : ''}${f.archived ? ' archived' : ''}`}
        onClick={() => onSelect(f)}
        onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onSelect(f)}
        onDoubleClick={() => setRenamingId(f.id)}
        onContextMenu={(e) => void openMenu(e, f)}
      >
        <span className="feature-row-top">
          <span className={`dot ${f.status}`} title={t.status[f.status]} />
          {renamingId === f.id ? (
            <input
              className="feature-row-rename"
              autoFocus
              defaultValue={f.title}
              onFocus={(e) => e.target.select()}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onBlur={(e) => commitRename(f, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(f, e.currentTarget.value)
                if (e.key === 'Escape') setRenamingId(null)
              }}
            />
          ) : (
            <span className="feature-row-title">{f.title}</span>
          )}
          {f.pinned && (
            <span className="feature-row-pin" title={t.menu.unpin} aria-label={t.menu.unpin}>
              ★
            </span>
          )}
          {f.status === 'queued' && f.queuePosition ? (
            <span className="feature-row-status">{t.sidebar.queueRank(f.queuePosition)}</span>
          ) : null}
        </span>
        <span className="feature-row-sub">
          {f.linear && <span className="feature-row-issue">{f.linear.identifier}</span>}
          {f.model && <span>{shortModel(f.model)}</span>}
          <span className="num">${f.costUsd.toFixed(2)}</span>
        </span>
      </div>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="sidebar-title">
          {t.sidebar.features} <span className="num">{features.length}</span>
        </span>
        <button onClick={onNew}>
          <span className="plus">+</span> {t.sidebar.newFeature}
        </button>
      </div>

      {features.length > 1 && (
        <div className="sidebar-search">
          <input
            ref={search}
            type="search"
            value={query}
            placeholder={t.sidebar.search}
            aria-label={t.sidebar.searchLabel}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onQuery('')
                e.currentTarget.blur()
              }
            }}
          />
          <select value={sort} aria-label={t.sidebar.sortBy} title={t.sidebar.sortBy} onChange={(e) => onSort(e.target.value as SidebarSort)}>
            {SIDEBAR_SORTS.map((s) => (
              <option key={s} value={s}>
                {t.sidebar.sort[s]}
              </option>
            ))}
          </select>
        </div>
      )}

      {present.length > 1 && (
        <div className="filters" role="group" aria-label={t.sidebar.filterByStatus}>
          <button className={`filter${active.length ? '' : ' selected'}`} onClick={() => onStatuses([])}>
            {t.sidebar.all}
          </button>
          {present.map((status) => (
            <button
              key={status}
              className={`filter${active.includes(status) ? ' selected' : ''}`}
              aria-pressed={active.includes(status)}
              title={t.status[status]}
              onClick={() => toggle(status)}
            >
              <span className={`dot ${status} still`} />
              <span className="num">{counts.get(status)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="sidebar-list">
        {shown.map(row)}
        {!features.length && <p className="sidebar-empty">{t.sidebar.none}</p>}
        {features.length > 0 && !shown.length && !archived.length && <p className="sidebar-empty">{t.sidebar.noMatch}</p>}
        {archived.length > 0 && (
          <details className="archive">
            <summary>{t.sidebar.archived(archived.length)}</summary>
            {archived.map(row)}
          </details>
        )}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-head">
          <span className="sidebar-title">
            {t.sidebar.launch}
            {project.commands.length > 0 && (
              <span className="num">
                {project.commands.length - idle.length}/{project.commands.length}
              </span>
            )}
          </span>
          <div className="sidebar-section-actions">
            {project.commands.length > 0 && (
              <button disabled={!idle.length} onClick={() => void startTerminal(...idle.map((c) => c.id))}>
                {t.sidebar.launchAll}
              </button>
            )}
            <button className="icon" onClick={onEditCommands} title={t.sidebar.launchSettings}>
              ⚙
            </button>
          </div>
        </div>
        {project.commands.length ? (
          <div className="launch-list">
            {project.commands.map((c) => {
              const tab = running(c.id)
              const name = c.name || c.command
              // A command at rest starts; one that runs brings its terminal up.
              const open = () => {
                if (!tab) return void startTerminal(c.id)
                showTerminal(tab)
                onShowTerminal()
              }
              return (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  className="launch-item"
                  title={tab ? t.sidebar.showCommand(name) : t.sidebar.runCommand(c.command)}
                  onClick={open}
                  onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && open()}
                >
                  <span className={`dot${tab ? ' done' : ''}`} />
                  <span className="launch-name">{name}</span>
                  <span className="launch-state">{tab ? t.sidebar.launchRunning : t.sidebar.launchReady}</span>
                  {tab ? (
                    <button
                      className="launch-toggle stop"
                      title={t.sidebar.stopCommand(name)}
                      aria-label={t.sidebar.stopCommand(name)}
                      onClick={(e) => {
                        e.stopPropagation()
                        closeTerminal(tab.info.id)
                      }}
                    >
                      ■
                    </button>
                  ) : (
                    <span className="launch-toggle" aria-hidden>
                      ▶
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="sidebar-note">
            {t.sidebar.noCommand}{' '}
            <button className="link" onClick={onEditCommands}>
              {t.sidebar.configure}
            </button>
          </p>
        )}
        {terminalError && <p className="sidebar-note error">{terminalError}</p>}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-head">
          <span className="sidebar-title">{t.sidebar.qa}</span>
          <div className="sidebar-section-actions">
            <button className="icon" onClick={onOpenQa} title={t.sidebar.qaOpen}>
              ⚙
            </button>
          </div>
        </div>
        <p className="sidebar-note">
          {project.qa.enabled ? t.sidebar.qaCounts(latestQa.filter((r) => r.status === 'passed').length, latestQa.filter((r) => r.status === 'failed' || r.status === 'error').length, latestQa.filter((r) => r.status === 'running').length) : t.sidebar.qaOff}{' '}
          <button className="link" onClick={onOpenQa}>
            {t.sidebar.qaOpen}
          </button>
        </p>
      </div>

      <div className="sidebar-project">
        <div className="sidebar-project-head">
          <span className="sidebar-title">{t.sidebar.project}</span>
          <span className="sidebar-section-actions">
            <button className="icon" onClick={onEditTemplates} title={t.sidebar.promptsSettings}>
              ✎
            </button>
            <button className="icon" onClick={onEditProject} title={t.sidebar.projectSettings}>
              ⚙
            </button>
          </span>
        </div>
        <p className="sidebar-path" title={project.path}>
          {project.path.replace(/^\/Users\/[^/]+/, '~')}
        </p>
        {project.linearLabel ? (
          <p className="sidebar-linear">
            <span className="dot done" /> Linear · {project.linearLabel.name}
          </p>
        ) : (
          linearConnected && (
            <p className="sidebar-linear">
              <button className="link" onClick={onEditProject}>
                {t.sidebar.linkLinear}
              </button>
            </p>
          )
        )}
      </div>
    </aside>
  )
}
