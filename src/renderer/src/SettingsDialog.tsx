import { useState } from 'react'
import { useT } from './i18n'

interface Props {
  version: string
  /** Opens the update dialog when a release is found. */
  onUpdateFound(): void
  onClose(): void
}

export function SettingsDialog({ version, onUpdateFound, onClose }: Props) {
  const t = useT()
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<'upToDate' | null>(null)

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
