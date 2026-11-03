import { useState } from 'react'
import type { UpdateInfo } from '../../shared/types'
import { downloadPercent } from '../../shared/version'
import { useT } from './i18n'

interface Props {
  update: UpdateInfo
  currentVersion: string
  onClose(): void
}

export function UpdateDialog({ update, currentVersion, onClose }: Props) {
  const t = useT()
  const [starting, setStarting] = useState(false)
  const progress = update.progress
  const phase = progress?.phase
  const command = update.command
  // macOS downloads on its own: this dialog then only asks for the restart.
  const background = update.installMode === 'mac-zip'
  const ready = phase === 'ready'
  const working = phase === 'downloading' || phase === 'preparing' || phase === 'installing'
  const busy = working || (starting && phase !== 'error' && !ready)

  function install() {
    setStarting(true)
    void window.api.installUpdate()
  }

  /** Declining is remembered: this version is not offered again on its own. A finished download is not declined, only postponed. */
  function later() {
    if (!ready) void window.api.dismissUpdate(update.version)
    onClose()
  }

  const hint = {
    brew: t.update.installHint,
    'mac-zip': t.update.installHintMac,
    'linux-pkg': t.update.installHintLinuxPkg,
    'linux-user': t.update.installHintLinuxUser,
    manual: ''
  }[update.installMode]
  const percent = downloadPercent(progress)

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && later()}>
      <div className="dialog" role="dialog" aria-labelledby="update-title">
        <h2 id="update-title">{ready ? t.update.readyTitle(update.version) : t.update.title(update.version)}</h2>
        <p className="confirm-detail">{t.update.current(currentVersion)}</p>

        {update.notes.trim() && <pre className="update-notes">{update.notes.trim()}</pre>}

        {update.canAutoInstall ? (
          <p className="hint">{ready ? t.update.readyHint : hint}</p>
        ) : (
          <>
            <p className="hint">{t.update.manualHint}</p>
            <pre className="update-command">{command}</pre>
          </>
        )}

        {busy && phase === 'downloading' && (
          <>
            <progress className="update-progress" value={percent} max={percent === undefined ? undefined : 100} />
            <p className="hint">{t.update.downloading(percent)}</p>
          </>
        )}
        {busy && phase === 'preparing' && <p className="hint">{t.update.preparing}</p>}
        {busy && phase === 'installing' && <p className="hint">{t.update.installing}</p>}
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
              {busy
                ? t.update.starting
                : phase === 'error'
                  ? t.update.retry
                  : ready
                    ? t.update.restartNow
                    : background
                      ? t.update.download
                      : t.update.install}
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
