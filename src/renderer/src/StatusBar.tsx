import { useEffect, useState } from 'react'
import { LANGS, type Lang } from '../../shared/i18n'
import { formatReset } from '../../shared/time'
import { THEMES, themeById } from '../../shared/themes'
import type { Feature, LinearStatus, UpdateInfo, UsageWarning } from '../../shared/types'
import { useLang, useT } from './i18n'
import { applyTheme, cachedTheme } from './theme'

interface Props {
  features: Feature[]
  linear: LinearStatus
  onOpenLinear(): void
  onLanguage(lang: Lang): void
  version: string
  update: UpdateInfo | null
  onOpenUpdate(): void
  onOpenSettings(): void
  /** Absent when no project is showing: a terminal belongs to one. */
  terminal?: { open: boolean; toggle(): void }
}

export function StatusBar({ features, linear, onOpenLinear, onLanguage, version, update, onOpenUpdate, onOpenSettings, terminal }: Props) {
  const t = useT()
  const lang = useLang()
  const count = (...statuses: Feature['status'][]) => features.filter((f) => statuses.includes(f.status)).length
  const cost = features.reduce((sum, f) => sum + f.costUsd, 0)
  const [maxRunning, setMaxRunning] = useState<number | null>(null)
  const [warning, setWarning] = useState<UsageWarning | null>(null)
  const [themeId, setThemeId] = useState(() => cachedTheme().id)

  useEffect(() => {
    void window.api.getMaxRunning().then(setMaxRunning)
    // The stored choice wins over the cached one, which may come from another data folder.
    void window.api.getTheme().then((id) => {
      setThemeId(id)
      applyTheme(themeById(id))
    })
    void window.api.getUsageWarning().then(setWarning)
    return window.api.onUsageWarning(setWarning)
  }, [])

  // The warning goes once its window has reset.
  useEffect(() => {
    if (!warning?.resetsAt) return
    const timer = setTimeout(() => setWarning(null), Math.max(0, warning.resetsAt * 1000 - Date.now()))
    return () => clearTimeout(timer)
  }, [warning])

  function changeMaxRunning(max: number) {
    setMaxRunning(max)
    void window.api.setMaxRunning(max)
  }

  function changeTheme(id: string) {
    setThemeId(id)
    applyTheme(themeById(id))
    void window.api.setTheme(id)
  }

  const resetTime = formatReset(warning?.resetsAt, lang)

  return (
    <footer className="statusbar">
      <span>
        <span className="dot working still" /> {t.statusbar.working(count('working'))}
      </span>
      <span>
        <span className="dot waiting" /> {t.statusbar.waiting(count('waiting'))}
      </span>
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
      {warning && <span className="statusbar-warning">{t.statusbar.usageNear(resetTime, warning.utilization, warning.limitType)}</span>}
      {maxRunning !== null && (
        <span className="max-running" title={t.statusbar.maxRunningHint}>
          {t.statusbar.maxRunning}
          <span className="lang-switch" role="group" aria-label={t.statusbar.maxRunning}>
            {[1, 2, 3, 0].map((n) => (
              <button
                key={n}
                className={n === maxRunning ? 'selected' : ''}
                aria-pressed={n === maxRunning}
                onClick={() => changeMaxRunning(n)}
              >
                {n || '∞'}
              </button>
            ))}
          </span>
        </span>
      )}
      <span>
        {t.statusbar.total} <span className="num strong">${cost.toFixed(2)}</span>
      </span>
      <span className="statusbar-right">
        {update ? (
          <button className="statusbar-update" onClick={onOpenUpdate}>
            {t.update.available(update.version)}
          </button>
        ) : (
          version && <span>v{version}</span>
        )}
      </span>
      <button className="statusbar-linear" title={t.update.settingsOpen} onClick={onOpenSettings}>
        ⚙ {t.update.settings}
      </button>
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
      <select
        className="theme-select"
        value={themeId}
        aria-label={t.statusbar.theme}
        title={t.statusbar.theme}
        onChange={(e) => changeTheme(e.target.value)}
      >
        {THEMES.map((theme) => (
          <option key={theme.id} value={theme.id}>
            {theme.name}
          </option>
        ))}
      </select>
      <span className="lang-switch" role="group" aria-label={t.statusbar.language}>
        {LANGS.map((l) => (
          <button key={l} className={l === lang ? 'selected' : ''} aria-pressed={l === lang} onClick={() => onLanguage(l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </span>
    </footer>
  )
}
