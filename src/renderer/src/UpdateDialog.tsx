import { useEffect, useState } from 'react'
import type { UpdateInfo, UpdateProgress } from '../../shared/types'
import { useT } from './i18n'

interface Props {
  update: UpdateInfo
  currentVersion: string
  onClose(): void
}

export function UpdateDialog({ update, currentVersion, onClose }: Props) {
  const t = useT()
  const [starting, setStarting] = useState(false)
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const command = update.command
  const busy = starting && progress?.phase !== 'error'

  useEffect(() => window.api.onUpdateProgress(setProgress), [])

  function install() {
    setStarting(true)
    setProgress(null)
    void window.api.installUpdate()
  }

  /** Declining is remembered: this version is not offered again on its own. */
  function later() {
    void window.api.dismissUpdate(update.version)
    onClose()
  }

  const hint = {
    brew: t.update.installHint,
    'mac-zip': t.update.installHintMac,
    'linux-pkg': t.update.installHintLinuxPkg,
    'linux-user': t.update.installHintLinuxUser,
    manual: ''
  }[update.installMode]
  const percent =
    progress?.phase === 'downloading' && progress.total ? Math.round(((progress.received ?? 0) / progress.total) * 100) : undefined

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && later()}>
      <div className="dialog" role="dialog" aria-labelledby="update-title">
        <h2 id="update-title">{t.update.title(update.version)}</h2>
        <p className="confirm-detail">{t.update.current(currentVersion)}</p>

        {update.notes.trim() && <pre className="update-notes">{update.notes.trim()}</pre>}

        {update.canAutoInstall ? (
          <p className="hint">{hint}</p>
        ) : (
          <>
            <p className="hint">{t.update.manualHint}</p>
            <pre className="update-command">{command}</pre>
          </>
        )}

        {busy && progress?.phase === 'downloading' && (
          <>
            <progress className="update-progress" value={percent} max={percent === undefined ? undefined : 100} />
            <p className="hint">{t.update.downloading(percent)}</p>
          </>
        )}
        {busy && progress?.phase === 'installing' && <p className="hint">{t.update.installing}</p>}
        {progress?.phase === 'error' && <p className="update-error">{t.update.failed(progress.message ?? '')}</p>}

        <div className="dialog-actions">
          <a className="button-link" href={update.url} target="_blank" rel="noreferrer">
            {t.update.notes}
          </a>
          <span className="spacer" />
          <button onClick={later} disabled={busy}>
            {t.update.later}
          </button>
          {update.canAutoInstall ? (
            <button className="primary" onClick={install} disabled={busy}>
              {busy ? t.update.starting : progress?.phase === 'error' ? t.update.retry : t.update.install}
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
