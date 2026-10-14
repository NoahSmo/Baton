import { useState } from 'react'
import type { UpdateInfo } from '../../shared/types'
import { useT } from './i18n'

interface Props {
  update: UpdateInfo
  currentVersion: string
  onClose(): void
}

export function UpdateDialog({ update, currentVersion, onClose }: Props) {
  const t = useT()
  const [starting, setStarting] = useState(false)
  const command = update.command

  function install() {
    setStarting(true)
    void window.api.installUpdate()
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !starting && onClose()}>
      <div className="dialog" role="dialog" aria-labelledby="update-title">
        <h2 id="update-title">{t.update.title(update.version)}</h2>
        <p className="confirm-detail">{t.update.current(currentVersion)}</p>

        {update.notes.trim() && <pre className="update-notes">{update.notes.trim()}</pre>}

        {update.canAutoInstall ? (
          <p className="hint">{t.update.installHint}</p>
        ) : (
          <>
            <p className="hint">{t.update.manualHint}</p>
            <pre className="update-command">{command}</pre>
          </>
        )}

        <div className="dialog-actions">
          <a className="button-link" href={update.url} target="_blank" rel="noreferrer">
            {t.update.notes}
          </a>
          <span className="spacer" />
          <button onClick={onClose} disabled={starting}>
            {t.update.later}
          </button>
          {update.canAutoInstall ? (
            <button className="primary" onClick={install} disabled={starting}>
              {starting ? t.update.starting : t.update.install}
            </button>
          ) : (
            <button className="primary" onClick={() => void navigator.clipboard.writeText(command)}>
              {t.update.copy}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
