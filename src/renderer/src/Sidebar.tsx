import { useState } from 'react'
import type { Feature, FeatureStatus, Project, TerminalTarget } from '../../shared/types'
import { openContextMenu } from './contextMenu'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'
import { closeTerminal, inTarget, openTerminal, showTerminal, useShownTerminal, useTerminals } from './terminalStore'

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
  /** Whether the terminal panel is on screen. */
  terminalOpen: boolean
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
  terminalOpen,
  onShowTerminal,
  linearConnected
}: Props) {
  const t = useT()
  // Terminals belong to the feature on screen, as in the panel; without one they are the project's.
  const target: TerminalTarget = selectedId ? { featureId: selectedId } : { projectId: project.id }
  const terminals = useTerminals().filter((tab) => inTarget(tab.info, target))
  const shownTerminal = useShownTerminal(target)
  const [terminalError, setTerminalError] = useState<string | null>(null)

  /** The terminal a launch command was started in, while it stays open. */
  const running = (commandId: string) => terminals.find((tab) => tab.info.commandId === commandId)
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
  const [filter, setFilter] = useState<FeatureStatus[]>([])
  const [renamingId, setRenamingId] = useState<string | null>(null)

  async function openMenu(e: React.MouseEvent, feature: Feature) {
    const action = await openContextMenu(e, { kind: 'feature', featureId: feature.id })
    if (action === 'rename-feature') setRenamingId(feature.id)
    if (action === 'link-feature') onLink(feature)
  }

  function commitRename(feature: Feature, title: string) {
    setRenamingId(null)
    if (title.trim() && title.trim() !== feature.title) void window.api.renameFeature(feature.id, title)
  }

  const counts = new Map<FeatureStatus, number>()
  for (const f of features) counts.set(f.status, (counts.get(f.status) ?? 0) + 1)
  const present = STATUS_ORDER.filter((s) => counts.has(s))
  // A filtered status can empty out (features change state, tabs change): ignore it rather than show nothing.
  const active = filter.filter((s) => counts.has(s))
  const shown = active.length ? features.filter((f) => active.includes(f.status)) : features

  const toggle = (status: FeatureStatus) =>
    setFilter(active.includes(status) ? active.filter((s) => s !== status) : [...active, status])

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

      {present.length > 1 && (
        <div className="filters" role="group" aria-label={t.sidebar.filterByStatus}>
          <button className={`filter${active.length ? '' : ' selected'}`} onClick={() => setFilter([])}>
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
        {shown.map((f) => (
          <div
            key={f.id}
            role="button"
            tabIndex={0}
            className={`feature-row${f.id === selectedId ? ' selected' : ''}`}
            onClick={() => onSelect(f)}
            onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && onSelect(f)}
            onDoubleClick={() => setRenamingId(f.id)}
            onContextMenu={(e) => void openMenu(e, f)}
          >
            <span className="feature-row-top">
              <span className={`dot ${f.status}`} />
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
              <span className="feature-row-status">{t.status[f.status]}</span>
            </span>
            <span className="feature-row-sub">
              {f.linear && <span className="feature-row-issue">{f.linear.identifier}</span>}
              {f.model && <span>{shortModel(f.model)}</span>}
              <span className="num">${f.costUsd.toFixed(2)}</span>
            </span>
          </div>
        ))}
        {!features.length && <p className="sidebar-empty">{t.sidebar.none}</p>}
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
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-head">
          <span className="sidebar-title">
            {t.sidebar.terminals} <span className="num">{terminals.length}</span>
          </span>
          <button className="icon" onClick={() => void startTerminal()} title={t.sidebar.newTerminal}>
            <span className="plus">+</span>
          </button>
        </div>
        {terminals.length > 0 && (
          <div className="terminal-rows">
            {terminals.map((tab) => (
              <div
                key={tab.info.id}
                role="button"
                tabIndex={0}
                className={`terminal-row${terminalOpen && tab === shownTerminal ? ' selected' : ''}`}
                title={tab.info.cwd}
                onClick={() => {
                  showTerminal(tab)
                  onShowTerminal()
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' || e.target !== e.currentTarget) return
                  showTerminal(tab)
                  onShowTerminal()
                }}
              >
                <span className="terminal-row-glyph">{tab.info.command ? '▶' : '%_'}</span>
                <span className="terminal-row-name">{tab.label}</span>
                <button
                  className="terminal-tab-close"
                  title={t.terminal.close}
                  aria-label={t.terminal.close}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTerminal(tab.info.id)
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {terminalError && <p className="sidebar-note error">{terminalError}</p>}
      </div>

      <div className="sidebar-project">
        <div className="sidebar-project-head">
          <span className="sidebar-title">{t.sidebar.project}</span>
          <button className="icon" onClick={onEditProject} title={t.sidebar.projectSettings}>
            ⚙
          </button>
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
