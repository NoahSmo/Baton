import { useEffect, useState } from 'react'
import type { ConfirmRequest } from '../../shared/types'

/** Draws the confirmations the main process asks for before destructive actions. */
export function ConfirmHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)

  useEffect(
    () =>
      window.api.onConfirm((next) =>
        setRequest((current) => {
          // A newer question replaces one left unanswered, which counts as declined.
          if (current) void window.api.answerConfirm(current.id, false)
          return next
        })
      ),
    []
  )

  function answer(confirmed: boolean) {
    if (!request) return
    void window.api.answerConfirm(request.id, confirmed)
    setRequest(null)
  }

  useEffect(() => {
    if (!request) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && answer(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [request])

  if (!request) return null

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && answer(false)}>
      <div className="dialog confirm" role="alertdialog" aria-labelledby="confirm-message" aria-describedby="confirm-detail">
        <h2 id="confirm-message">{request.message}</h2>
        <p id="confirm-detail" className="confirm-detail">
          {request.detail}
        </p>
        <div className="dialog-actions">
          {/* Focus starts on Cancel: Enter must never delete by accident. */}
          <button autoFocus onClick={() => answer(false)}>
            {request.cancelLabel}
          </button>
          <button className={request.danger ? 'danger-fill' : 'primary'} onClick={() => answer(true)}>
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
