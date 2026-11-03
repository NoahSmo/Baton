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

/** A labelled on/off row; the whole row toggles. */
function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange(value: boolean): void }) {
  return (
    <label className="settings-row" title={hint}>
      <span>{label}</span>
      <input type="checkbox" className="switch" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function SettingsDialog({ version, onLanguage, onUpdateFound, onRestored, onClose }: Props) {
  const t = useT()
  const lang = useLang()
  const [maxRunning, setMaxRunning] = useState<number | null>(null)
  const [autoContinue, setAutoContinue] = useState<boolean | null>(null)
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
    void window.api.getAutoContinue().then(setAutoContinue)
    // The stored choice wins over the cached one, which may come from another data folder.
    void window.api.getTheme().then(setThemeId)
  }, [])

  function changeAutoContinue(enabled: boolean) {
    setAutoContinue(enabled)
    void window.api.setAutoContinue(enabled)
  }

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
        <div className="settings-body">
          <section className="settings-section">
            <h3 className="settings-title">{t.update.settings}</h3>
            <div className="settings-card">
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
            </div>
          </section>

          {(maxRunning !== null || autoContinue !== null) && (
            <section className="settings-section">
              <h3 className="settings-title">{t.statusbar.maxRunning}</h3>
              <div className="settings-card">
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
                {autoContinue !== null && <Toggle label={t.statusbar.autoContinue} hint={t.statusbar.autoContinueHint} checked={autoContinue} onChange={changeAutoContinue} />}
              </div>
            </section>
          )}

          {prefs && (
            <section className="settings-section">
              <h3 className="settings-title">{t.notifications.title}</h3>
              <div className="settings-card">
                {EVENTS.map((event) => (
                  <Toggle key={event} label={t.notifications.events[event]} checked={prefs[event]} onChange={(value) => changePrefs({ [event]: value })} />
                ))}
                <Toggle label={t.notifications.sound} checked={prefs.sound} onChange={(value) => changePrefs({ sound: value })} />
                <Toggle label={t.notifications.whenFocused} hint={t.notifications.whenFocusedHint} checked={prefs.whenFocused} onChange={(value) => changePrefs({ whenFocused: value })} />
              </div>
            </section>
          )}

          <section className="settings-section">
            <h3 className="settings-title">{t.shortcuts.title}</h3>
            <div className="settings-card">
              {SHORTCUT_LIST.map((action) => (
                <div key={action} className="settings-row">
                  <span>{t.shortcuts.actions[action.startsWith('project:') ? 'project' : (action as keyof typeof t.shortcuts.actions)]}</span>
                  <kbd>{shortcutLabel(action, IS_MAC)}</kbd>
                </div>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <h3 className="settings-title">{t.trash.title}</h3>
            <p className="hint">{t.trash.hint}</p>
            <div className="settings-card">
              {trash.length === 0 && <p className="hint settings-empty">{t.trash.empty}</p>}
              {trash.map((entry) => (
                <div key={entry.id} className="settings-row trash-row">
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
            </div>
            {trashError && <p className="form-error">{trashError}</p>}
          </section>
        </div>

        <div className="dialog-actions settings-foot">
          <span className="hint">
            {t.update.current(version)}
            {result && ` · ${t.update.upToDate(version)}`}
          </span>
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
