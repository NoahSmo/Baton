import { useEffect, useState } from 'react'
import { LANGS, type Lang } from '../../shared/i18n'
import { SHORTCUT_LIST, shortcutLabel } from '../../shared/shortcuts'
import { THEMES, themeById } from '../../shared/themes'
import type { Feature, NotificationPrefs, TrashEntry } from '../../shared/types'
import { useLang, useT } from './i18n'
import { cleanError } from './NewFeatureDialog'
import { IS_MAC } from './platform'
import { applyTheme, cachedTheme } from './theme'

interface Props {
  version: string
  onLanguage(lang: Lang): void
  /** Opens the update dialog when a release is found. */
  onUpdateFound(): void
  /** A removed agent came back. */
  onRestored(feature: Feature): void
  onClose(): void
}

const EVENTS = ['waiting', 'done', 'error', 'limited'] as const

export function SettingsDialog({ version, onLanguage, onUpdateFound, onRestored, onClose }: Props) {
  const t = useT()
  const lang = useLang()
  const [maxRunning, setMaxRunning] = useState<number | null>(null)
  const [themeId, setThemeId] = useState(() => cachedTheme().id)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<'upToDate' | null>(null)
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [trash, setTrash] = useState<TrashEntry[]>([])
  const [trashError, setTrashError] = useState('')

  useEffect(() => {
    void window.api.getNotificationPrefs().then(setPrefs)
    void window.api.trashList().then(setTrash)
    void window.api.getMaxRunning().then(setMaxRunning)
    // The stored choice wins over the cached one, which may come from another data folder.
    void window.api.getTheme().then(setThemeId)
  }, [])

  function changeMaxRunning(max: number) {
    setMaxRunning(max)
    void window.api.setMaxRunning(max)
  }

  function changeTheme(id: string) {
    setThemeId(id)
    applyTheme(themeById(id))
    void window.api.setTheme(id)
  }

  function changePrefs(patch: Partial<NotificationPrefs>) {
    if (!prefs) return
    const next = { ...prefs, ...patch }
    setPrefs(next)
    void window.api.setNotificationPrefs(next)
  }

  async function restore(entry: TrashEntry) {
    setTrashError('')
    try {
      onRestored(await window.api.trashRestore(entry.id))
      setTrash((list) => list.filter((e) => e.id !== entry.id))
    } catch (err) {
      setTrashError(cleanError(err))
    }
  }

  async function discard(entry: TrashEntry) {
    await window.api.trashDiscard(entry.id)
    setTrash((list) => list.filter((e) => e.id !== entry.id))
  }

  async function check() {
    setChecking(true)
    setResult(null)
    const { update } = await window.api.checkUpdate()
    setChecking(false)
    if (update) onUpdateFound()
    else setResult('upToDate')
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog settings-dialog" role="dialog" aria-labelledby="settings-title">
        <h2 id="settings-title">{t.update.settings}</h2>
        <div className="settings-row">
          <span>{t.statusbar.language}</span>
          <span className="lang-switch" role="group" aria-label={t.statusbar.language}>
            {LANGS.map((l) => (
              <button key={l} className={l === lang ? 'selected' : ''} aria-pressed={l === lang} onClick={() => onLanguage(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </span>
        </div>
        <div className="settings-row">
          <span>{t.statusbar.theme}</span>
          <select value={themeId} aria-label={t.statusbar.theme} onChange={(e) => changeTheme(e.target.value)}>
            {THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </div>
        {maxRunning !== null && (
          <div className="settings-row" title={t.statusbar.maxRunningHint}>
            <span>{t.statusbar.maxRunning}</span>
            <span className="lang-switch" role="group" aria-label={t.statusbar.maxRunning}>
              {[1, 2, 3, 0].map((n) => (
                <button key={n} className={n === maxRunning ? 'selected' : ''} aria-pressed={n === maxRunning} onClick={() => changeMaxRunning(n)}>
                  {n || '∞'}
                </button>
              ))}
            </span>
          </div>
        )}
        {prefs && (
          <>
            <h3 className="settings-title">{t.notifications.title}</h3>
            {EVENTS.map((event) => (
              <label key={event} className="settings-check">
                <input type="checkbox" checked={prefs[event]} onChange={(e) => changePrefs({ [event]: e.target.checked })} />
                {t.notifications.events[event]}
              </label>
            ))}
            <label className="settings-check">
              <input type="checkbox" checked={prefs.sound} onChange={(e) => changePrefs({ sound: e.target.checked })} />
              {t.notifications.sound}
            </label>
            <label className="settings-check" title={t.notifications.whenFocusedHint}>
              <input type="checkbox" checked={prefs.whenFocused} onChange={(e) => changePrefs({ whenFocused: e.target.checked })} />
              {t.notifications.whenFocused}
            </label>
          </>
        )}

        <h3 className="settings-title">{t.shortcuts.title}</h3>
        <div className="shortcut-list">
          {SHORTCUT_LIST.map((action) => (
            <div key={action} className="shortcut-row">
              <span>{t.shortcuts.actions[action.startsWith('project:') ? 'project' : (action as keyof typeof t.shortcuts.actions)]}</span>
              <kbd>{shortcutLabel(action, IS_MAC)}</kbd>
            </div>
          ))}
        </div>

        <h3 className="settings-title">{t.trash.title}</h3>
        <p className="hint">{t.trash.hint}</p>
        {trash.length === 0 && <p className="hint">{t.trash.empty}</p>}
        {trash.map((entry) => (
          <div key={entry.id} className="trash-row">
            <span className="trash-name" title={entry.branch}>
              {entry.title}
              <span className="hint">
                {' '}
                · {entry.projectName} · {t.trash.files(entry.files)}
              </span>
            </span>
            <button onClick={() => void restore(entry)}>{t.trash.restore}</button>
            <button className="danger" onClick={() => void discard(entry)}>
              {t.trash.discard}
            </button>
          </div>
        ))}
        {trashError && <p className="form-error">{trashError}</p>}

        <p className="confirm-detail">{t.update.current(version)}</p>
        {result && <p className="hint">{t.update.upToDate(version)}</p>}
        <div className="dialog-actions">
          <span className="spacer" />
          <button onClick={onClose}>{t.update.close}</button>
          <button className="primary" onClick={() => void check()} disabled={checking}>
            {checking ? t.update.checking : t.update.checkNow}
          </button>
        </div>
      </div>
    </div>
  )
}
