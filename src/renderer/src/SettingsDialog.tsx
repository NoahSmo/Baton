import { useEffect, useState } from 'react'
import { LANGS, type Lang } from '../../shared/i18n'
import { SHORTCUT_LIST, shortcutLabel } from '../../shared/shortcuts'
import { newCustomTheme, THEMES, themeById, TRANSLUCENT_KEYS, type Palette, type Theme } from '../../shared/themes'
import { DEFAULT_ACCOUNT } from '../../shared/accounts'
import type { ClaudeAccounts, ClaudeAccountStatus, Feature, NotificationPrefs, TrashEntry } from '../../shared/types'
import { useLang, useT } from './i18n'
import { cleanError } from './NewFeatureDialog'
import { IS_MAC } from './platform'
import { applyTheme, cachedTheme } from './theme'
import { DialogClose } from './DialogClose'

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
  const [removeOnArchive, setRemoveOnArchive] = useState<boolean | null>(null)
  const [autoRemoveMerged, setAutoRemoveMerged] = useState<boolean | null>(null)
  const [themeId, setThemeId] = useState(() => cachedTheme().id)
  const [customs, setCustoms] = useState<Theme[]>([])
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<'upToDate' | null>(null)
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null)
  const [accounts, setAccounts] = useState<ClaudeAccounts | null>(null)
  const [accountName, setAccountName] = useState('')
  const [accountStatus, setAccountStatus] = useState<Record<string, ClaudeAccountStatus>>({})
  const [loggingIn, setLoggingIn] = useState<string | null>(null)
  const [trash, setTrash] = useState<TrashEntry[]>([])
  const [trashError, setTrashError] = useState('')

  useEffect(() => {
    void window.api.getNotificationPrefs().then(setPrefs)
    void window.api.trashList().then(setTrash)
    void window.api.getClaudeAccounts().then((a) => {
      setAccounts(a)
      for (const key of [DEFAULT_ACCOUNT, ...a.accounts.map((x) => x.id)]) void refreshStatus(key)
    })
    void window.api.getMaxRunning().then(setMaxRunning)
    void window.api.getAutoContinue().then(setAutoContinue)
    void window.api.getRemoveWorktreeOnArchive().then(setRemoveOnArchive)
    void window.api.getAutoRemoveMerged().then(setAutoRemoveMerged)
    // The stored choice wins over the cached one, which may come from another data folder.
    void window.api.getTheme().then(setThemeId)
    void window.api.getCustomThemes().then(setCustoms)
  }, [])

  function changeAutoContinue(enabled: boolean) {
    setAutoContinue(enabled)
    void window.api.setAutoContinue(enabled)
  }

  function changeAutoRemoveMerged(enabled: boolean) {
    setAutoRemoveMerged(enabled)
    void window.api.setAutoRemoveMerged(enabled)
  }

  function changeRemoveOnArchive(enabled: boolean) {
    setRemoveOnArchive(enabled)
    void window.api.setRemoveWorktreeOnArchive(enabled)
  }

  function changeMaxRunning(max: number) {
    setMaxRunning(max)
    void window.api.setMaxRunning(max)
  }

  function changeTheme(id: string, list = customs) {
    setThemeId(id)
    applyTheme(themeById(id, list))
    void window.api.setTheme(id)
  }

  /** Saves the list; the chosen theme is repainted in case it is the one that changed. */
  function saveCustoms(list: Theme[], chosen = themeId) {
    setCustoms(list)
    void window.api.setCustomThemes(list).then(() => changeTheme(chosen, list))
  }

  function addCustom(base: Theme) {
    const made = newCustomTheme(base, `${base.name} ${t.statusbar.customThemes.toLowerCase()}`)
    saveCustoms([...customs, made], made.id)
  }

  function editCustom(patch: Partial<Omit<Theme, 'colors'>> & { colors?: Partial<Palette> }) {
    const current = customs.find((c) => c.id === themeId)
    if (!current) return
    const next = { ...current, ...patch, colors: { ...current.colors, ...patch.colors } }
    const list = customs.map((c) => (c.id === current.id ? next : c))
    // Painted at once; saved without the round trip the select needs.
    setCustoms(list)
    applyTheme(next)
    void window.api.setCustomThemes(list)
  }

  function deleteCustom() {
    saveCustoms(
      customs.filter((c) => c.id !== themeId),
      themeById(themeId).id
    )
  }

  function changePrefs(patch: Partial<NotificationPrefs>) {
    if (!prefs) return
    const next = { ...prefs, ...patch }
    setPrefs(next)
    void window.api.setNotificationPrefs(next)
  }

  async function refreshStatus(key: string) {
    const status = await window.api.claudeAccountStatus(key)
    setAccountStatus((all) => ({ ...all, [key]: status }))
  }

  /** The browser opens for the sign-in; the row shows who is logged in once it is over. */
  async function login(key: string) {
    setLoggingIn(key)
    try {
      const status = await window.api.loginClaudeAccount(key)
      setAccountStatus((all) => ({ ...all, [key]: status }))
    } finally {
      setLoggingIn(null)
    }
  }

  /** A new account is useless until signed in: the sign-in starts right away. */
  async function addAccount() {
    const name = accountName.trim()
    if (!name) return
    const before = new Set(accounts?.accounts.map((a) => a.id))
    const next = await window.api.addClaudeAccount(name)
    setAccounts(next)
    setAccountName('')
    const added = next.accounts.find((a) => !before.has(a.id))
    if (added) void login(added.id)
  }

  function accountState(key: string) {
    if (loggingIn === key) return t.accounts.loggingIn
    const status = accountStatus[key]
    if (!status) return ''
    return status.loggedIn ? (status.email ?? t.accounts.loggedIn) : t.accounts.notLoggedIn
  }

  function loginButton(key: string) {
    const status = accountStatus[key]
    return (
      <button onClick={() => void login(key)} disabled={loggingIn !== null}>
        {status?.loggedIn ? t.accounts.relogin : t.accounts.login}
      </button>
    )
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
        <DialogClose onClose={onClose} />
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
                  {customs.length > 0 && (
                    <optgroup label={t.statusbar.customThemes}>
                      {customs.map((theme) => (
                        <option key={theme.id} value={theme.id}>
                          {theme.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div className="settings-row">
                <span>{t.statusbar.customThemes}</span>
                <span className="theme-actions">
                  <button onClick={() => addCustom(themeById(themeId, customs))}>
                    {customs.some((c) => c.id === themeId) ? t.statusbar.duplicateTheme : t.statusbar.newTheme}
                  </button>
                  {customs.some((c) => c.id === themeId) && (
                    <button className="danger" onClick={deleteCustom}>
                      {t.statusbar.deleteTheme}
                    </button>
                  )}
                </span>
              </div>
              {customs.map(
                (custom) =>
                  custom.id === themeId && (
                    <div className="settings-row theme-editor" key={custom.id}>
                      <label className="theme-field theme-name">
                        <span>{t.statusbar.themeName}</span>
                        <input value={custom.name} maxLength={40} onChange={(e) => editCustom({ name: e.target.value })} />
                      </label>
                      <label className="theme-field theme-dark">
                        <input type="checkbox" checked={custom.dark} onChange={(e) => editCustom({ dark: e.target.checked })} />
                        <span>{t.statusbar.themeDark}</span>
                      </label>
                      <div className="theme-colors">
                        {(Object.keys(custom.colors) as (keyof Palette)[])
                          .filter((key) => !TRANSLUCENT_KEYS.includes(key))
                          .map((key) => (
                            <label className="theme-field" key={key}>
                              <input type="color" value={custom.colors[key]} onChange={(e) => editCustom({ colors: { [key]: e.target.value } as Partial<Palette> })} />
                              <span>{t.statusbar.themeColors[key] ?? key}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                  )
              )}
            </div>
          </section>

          {(maxRunning !== null || autoContinue !== null || removeOnArchive !== null || autoRemoveMerged !== null) && (
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
                {autoRemoveMerged !== null && <Toggle label={t.statusbar.autoRemoveMerged} hint={t.statusbar.autoRemoveMergedHint} checked={autoRemoveMerged} onChange={changeAutoRemoveMerged} />}
                {removeOnArchive !== null && <Toggle label={t.statusbar.removeWorktreeOnArchive} hint={t.statusbar.removeWorktreeOnArchiveHint} checked={removeOnArchive} onChange={changeRemoveOnArchive} />}
              </div>
            </section>
          )}

          {accounts && (
            <section className="settings-section">
              <h3 className="settings-title">{t.accounts.title}</h3>
              <p className="hint">{t.accounts.hint}</p>
              <div className="settings-card">
                <label className="settings-row">
                  <span>{t.accounts.default}</span>
                  <span className="hint">{accountState(DEFAULT_ACCOUNT)}</span>
                  <input type="radio" name="claude-account" checked={accounts.activeId === null} onChange={() => void window.api.setActiveClaudeAccount(null).then(setAccounts)} />
                </label>
                {accounts.accounts.map((a) => (
                  <div key={a.id} className="settings-row">
                    <label className="trash-name" title={a.configDir}>
                      <input type="radio" name="claude-account" checked={accounts.activeId === a.id} onChange={() => void window.api.setActiveClaudeAccount(a.id).then(setAccounts)} /> {a.name}
                      <span className="hint"> · {accountState(a.id)}</span>
                    </label>
                    {loginButton(a.id)}
                    <button className="danger" onClick={() => void window.api.removeClaudeAccount(a.id).then(setAccounts)}>
                      {t.accounts.remove}
                    </button>
                  </div>
                ))}
                <div className="settings-row">
                  <input value={accountName} placeholder={t.accounts.name} aria-label={t.accounts.name} onChange={(e) => setAccountName(e.target.value)} />
                  <button onClick={() => void addAccount()} disabled={!accountName.trim() || loggingIn !== null}>
                    {t.accounts.add}
                  </button>
                </div>
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
            {trashError && <p className="form-error" role="alert">{trashError}</p>}
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
