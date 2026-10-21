import { useEffect, useState } from 'react'
import { formatReset } from '../../shared/time'
import type { Feature, LinearStatus, UpdateInfo, UsageWarning, UsageWindow } from '../../shared/types'
import { limitWindow } from '../../shared/i18n'
import { useLang, useT } from './i18n'

interface Props {
  features: Feature[]
  linear: LinearStatus
  onOpenLinear(): void
  version: string
  update: UpdateInfo | null
  onOpenUpdate(): void
  /** Absent when no project is showing: a terminal belongs to one. */
  terminal?: { open: boolean; toggle(): void }
  /** Jumps to the agent that has waited longest for an answer, shortcut included in the label. */
  onNextWaiting(): void
  nextWaitingShortcut: string
  onOpenUsage(): void
}

export function StatusBar({ features, linear, onOpenLinear, version, update, onOpenUpdate, terminal, onNextWaiting, nextWaitingShortcut, onOpenUsage }: Props) {
  const t = useT()
  const lang = useLang()
  const count = (...statuses: Feature['status'][]) => features.filter((f) => statuses.includes(f.status)).length
  const cost = features.reduce((sum, f) => sum + f.costUsd, 0)
  const [warning, setWarning] = useState<UsageWarning | null>(null)

  useEffect(() => {
    void window.api.getUsageWarning().then(setWarning)
    return window.api.onUsageWarning(setWarning)
  }, [])

  const [windows, setWindows] = useState<UsageWindow[]>([])

  useEffect(() => {
    void window.api.getUsageWindows().then(setWindows)
    return window.api.onUsageWindows(setWindows)
  }, [])

  // A window that has reset is full again: its last reading no longer holds.
  useEffect(() => {
    const next = Math.min(...windows.map((w) => (w.resetsAt ? w.resetsAt * 1000 : Infinity)))
    if (!Number.isFinite(next)) return
    const timer = setTimeout(() => setWindows((all) => all.filter((w) => !w.resetsAt || w.resetsAt * 1000 > Date.now())), Math.max(0, next - Date.now()) + 1000)
    return () => clearTimeout(timer)
  }, [windows])

  // The warning goes once its window has reset.
  useEffect(() => {
    if (!warning?.resetsAt) return
    const timer = setTimeout(() => setWarning(null), Math.max(0, warning.resetsAt * 1000 - Date.now()))
    return () => clearTimeout(timer)
  }, [warning])

  const resetTime = formatReset(warning?.resetsAt, lang)

  return (
    <footer className="statusbar">
      <span>
        <span className="dot working still" /> {t.statusbar.working(count('working'))}
      </span>
      {count('waiting') > 0 ? (
        <button className="statusbar-linear" title={`${t.statusbar.nextWaiting(count('waiting'))} · ${nextWaitingShortcut}`} onClick={onNextWaiting}>
          <span className="dot waiting" /> {t.statusbar.waiting(count('waiting'))} →
        </button>
      ) : (
        <span>
          <span className="dot waiting" /> {t.statusbar.waiting(0)}
        </span>
      )}
      {count('queued') > 0 && (
        <span>
          <span className="dot queued" /> {t.statusbar.queued(count('queued'))}
        </span>
      )}
      <span>
        <span className="dot done" /> {t.statusbar.done(count('done'))}
      </span>
      {count('error', 'limited') > 0 && (
        <span>
          <span className="dot error" /> {t.statusbar.stopped(count('error', 'limited'))}
        </span>
      )}
      <span className="statusbar-sep" />
      {windows.map((w) => {
        const kind = limitWindow(w.limitType)
        const used = Math.min(1, Math.max(0, w.utilization))
        const level = used >= 0.95 ? ' critical' : used >= 0.8 ? ' high' : ''
        const reset = formatReset(w.resetsAt, lang)
        return (
          <span
            key={w.limitType ?? ''}
            className={`credit-meter${level}`}
            title={t.statusbar.creditLeft(kind, Math.round((1 - used) * 100), reset)}
            role="img"
            aria-label={t.statusbar.creditLeft(kind, Math.round((1 - used) * 100), reset)}
          >
            {kind === 'weekly' ? '7d' : kind === 'daily' ? '5h' : '∗'}
            <span className="credit-bar">
              <span style={{ width: `${(1 - used) * 100}%` }} />
            </span>
            <span className="num strong">{Math.round((1 - used) * 100)}%</span>
          </span>
        )
      })}
      {warning && <span className="statusbar-warning">{t.statusbar.usageNear(resetTime, warning.utilization, warning.limitType)}</span>}
      <button className="statusbar-linear" title={t.usage.title} onClick={onOpenUsage}>
        {t.statusbar.total} <span className="num strong">${cost.toFixed(2)}</span>
      </button>
      <span className="statusbar-right">
        {update ? (
          <button className="statusbar-update" onClick={onOpenUpdate}>
            {t.update.available(update.version)}
          </button>
        ) : (
          version && <span>v{version}</span>
        )}
      </span>
      {terminal && (
        <button
          className={`statusbar-linear${terminal.open ? ' strong' : ''}`}
          aria-pressed={terminal.open}
          title={t.feature.toggleTerminalHint}
          onClick={terminal.toggle}
        >
          {'>_'} {t.feature.terminal}
        </button>
      )}
      <button className="statusbar-linear" onClick={onOpenLinear}>
        <span className={`dot ${linear.connected ? 'done' : ''}`} />
        {linear.connected ? `Linear · ${linear.userName ?? t.statusbar.linearConnected}` : t.statusbar.connectLinear}
      </button>
    </footer>
  )
}
