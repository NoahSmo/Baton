import { useEffect, useState } from 'react'
import { LANGS, type Lang } from '../../shared/i18n'
import { THEMES, themeById } from '../../shared/themes'
import { useLang, useT } from './i18n'
import { applyTheme, cachedTheme } from './theme'

interface Props {
  version: string
  onLanguage(lang: Lang): void
  /** Opens the update dialog when a release is found. */
  onUpdateFound(): void
  onClose(): void
}

export function SettingsDialog({ version, onLanguage, onUpdateFound, onClose }: Props) {
  const t = useT()
  const lang = useLang()
  const [maxRunning, setMaxRunning] = useState<number | null>(null)
  const [themeId, setThemeId] = useState(() => cachedTheme().id)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<'upToDate' | null>(null)

  useEffect(() => {
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
      <div className="dialog" role="dialog" aria-labelledby="settings-title">
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
