import { useEffect, useRef, useState } from 'react'
import type { Feature, Project, TerminalTarget } from '../../shared/types'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'
import {
  attachTerminal,
  closeTerminal,
  ensureTerminal,
  fitTerminal,
  inTarget,
  openTerminal,
  showTerminal,
  useShownTerminal,
  useTerminals
} from './terminalStore'

interface Props {
  project: Project
  /** The feature on screen, which owns the terminals shown; without one they are the project's. */
  feature: Feature | null
  height: number
  onHide(): void
}

/** Bottom panel holding the terminals of the feature on screen, each in its worktree. */
export function TerminalPanel({ project, feature, height, onHide }: Props) {
  const t = useT()
  const target: TerminalTarget = feature ? { featureId: feature.id } : { projectId: project.id }
  const tabs = useTerminals().filter((tab) => inTarget(tab.info, target))
  const active = useShownTerminal(target)
  const [error, setError] = useState<string | null>(null)
  const host = useRef<HTMLDivElement>(null)
  const hadTabs = useRef(false)

  function fail(err: unknown) {
    setError(t.terminal.failed(cleanError(err)))
  }

  // An empty panel starts a shell in the worktree on screen; closing the last one puts the panel away.
  useEffect(() => {
    if (tabs.length) hadTabs.current = true
    else if (hadTabs.current) onHide()
    else ensureTerminal(target).catch(fail)
  }, [tabs.length])

  useEffect(() => {
    const el = host.current
    if (!el || !active) return
    attachTerminal(active, el)
    const observer = new ResizeObserver(() => fitTerminal(active))
    observer.observe(el)
    return () => {
      observer.disconnect()
      active.el.remove()
    }
  }, [active])

  function open() {
    setError(null)
    openTerminal(target).catch(fail)
  }

  return (
    <section className="terminal-panel" style={{ height }}>
      <header className="terminal-tabs">
        <div className="terminal-tablist" role="tablist">
          {tabs.map((tab) => (
            <div
              key={tab.info.id}
              role="tab"
              tabIndex={0}
              aria-selected={tab === active}
              className={`terminal-tab${tab === active ? ' selected' : ''}`}
              title={tab.info.cwd}
              onClick={() => showTerminal(tab)}
              onKeyDown={(e) => e.key === 'Enter' && showTerminal(tab)}
            >
              <span className="terminal-tab-name">{tab.label}</span>
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
        <button
          className="terminal-action"
          title={feature ? t.terminal.newInWorktree : t.terminal.newInProject(project.name)}
          onClick={open}
        >
          <span className="plus">+</span> {feature ? t.terminal.worktree : project.name}
        </button>
        <button className="terminal-action" title={t.terminal.hide} aria-label={t.terminal.hide} onClick={onHide}>
          ▾
        </button>
      </header>
      {error && <p className="terminal-error">{error}</p>}
      <div className="terminal-host" ref={host} />
    </section>
  )
}
