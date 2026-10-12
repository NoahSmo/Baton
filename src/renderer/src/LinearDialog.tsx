import { useState, type FormEvent } from 'react'
import type { LinearStatus } from '../../shared/types'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'

interface Props {
  status: LinearStatus
  onChange(status: LinearStatus): void
  onClose(): void
}

export function LinearDialog({ status, onChange, onClose }: Props) {
  const t = useT()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function connect(e: FormEvent) {
    e.preventDefault()
    if (!key.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      onChange(await window.api.linearConnect(key))
      setKey('')
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    await window.api.linearDisconnect()
    onChange({ connected: false })
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" onSubmit={connect}>
        <h2>Linear</h2>
        {status.connected ? (
          <>
            <p className="hint">
              {t.linear.connectedAs(status.userName)} {t.linear.connectedBody}
            </p>
            <div className="dialog-actions">
              <button type="button" className="danger" onClick={disconnect}>
                {t.linear.disconnect}
              </button>
              <button type="button" className="primary" onClick={onClose}>
                {t.linear.done}
              </button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="linear-key">{t.linear.keyLabel}</label>
            <input
              id="linear-key"
              type="password"
              autoFocus
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="lin_api_…"
            />
            <p className="hint">{t.linear.keyHint}</p>
            {error && <p className="form-error">{error}</p>}
            <div className="dialog-actions">
              <button type="button" onClick={onClose}>
                {t.common.cancel}
              </button>
              <button type="submit" className="primary" disabled={!key.trim() || busy}>
                {busy ? t.linear.checking : t.linear.connect}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}
