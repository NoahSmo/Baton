import { useEffect, useRef, useState } from 'react'
import type { ConflictCheck, ConflictResolution, Feature } from '../../shared/types'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'

interface Props {
  feature: Feature
  check: ConflictCheck
  onClose(): void
}

/** Has Claude resolve the conflicts of a merge a push needs, shows how, and lets the user amend it before it is pushed. */
export function ConflictDialog({ feature, check, onClose }: Props) {
  const t = useT()
  const [resolution, setResolution] = useState<ConflictResolution | null>(null)
  // What the user typed, by path; a file absent here still holds Claude's version.
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // The effect runs twice in development: one merge only.
    if (started.current) return
    started.current = true
    window.api.gitResolveConflicts(feature.id, check.target).then(
      (r) => {
        setResolution(r)
        // Files Claude left in conflict are the ones to look at first.
        setOpen(new Set(r.files.filter((f) => !f.resolved).map((f) => f.path)))
      },
      (err) => setError(cleanError(err) || t.git.resolveFailed)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function abort() {
    if (busy) return
    setBusy(true)
    // Claude still working: the main process puts the worktree back once it stops.
    if (!resolution) window.api.cancelGitResolveConflicts(feature.id)
    else await window.api.gitAbortMerge(feature.id).catch(() => undefined)
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && void abort()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      await window.api.gitFinishMerge(
        feature.id,
        Object.entries(edits).map(([path, content]) => ({ path, content }))
      )
      onClose()
    } catch (err) {
      setError(cleanError(err))
      setBusy(false)
    }
  }

  function toggle(path: string) {
    const next = new Set(open)
    if (!next.delete(path)) next.add(path)
    setOpen(next)
  }

  const contentOf = (path: string, original: string) => edits[path] ?? original
  const markersLeft = resolution?.files.some((f) => /^<{7}( |$)/m.test(contentOf(f.path, f.content)) && /^>{7}( |$)/m.test(contentOf(f.path, f.content)))
  const failed = !resolution && error

  return (
    <div className="overlay">
      <div className="dialog conflict-dialog" role="dialog" aria-labelledby="conflict-title">
        <h2 id="conflict-title">{t.git.conflictTitle}</h2>
        <p className="hint">
          {resolution ? t.git.recapIntro(resolution.target) : t.git.conflictIntro(check.target, check.files.length)}
        </p>
        {!resolution && !failed && <p className="hint">{t.git.resolving}</p>}
        <div className="conflict-list">
          {(resolution?.files ?? check.files.map((path) => ({ path, content: '', summary: '', resolved: true }))).map((f) => {
            const edited = f.path in edits
            return (
              <div key={f.path} className="conflict-file">
                <div className="conflict-head">
                  <span className="commit-path" title={f.path}>
                    {f.path}
                  </span>
                  {resolution && (
                    <button className="link" onClick={() => toggle(f.path)}>
                      {open.has(f.path) ? t.git.hideFile : t.git.editFile}
                    </button>
                  )}
                </div>
                {resolution && f.summary && <p className="conflict-summary">{f.summary}</p>}
                {resolution && !f.resolved && !edited && <p className="form-error">{t.git.needsYou}</p>}
                {resolution && open.has(f.path) && (
                  <>
                    <textarea
                      className="conflict-editor"
                      spellCheck={false}
                      rows={14}
                      value={contentOf(f.path, f.content)}
                      onChange={(e) => setEdits({ ...edits, [f.path]: e.target.value })}
                    />
                    {edited && (
                      <button
                        className="link"
                        onClick={() => {
                          const { [f.path]: _dropped, ...rest } = edits
                          setEdits(rest)
                        }}
                      >
                        {t.git.resetFile}
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
        {markersLeft && <p className="form-error">{t.git.markersLeft}</p>}
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions">
          <button onClick={() => void abort()} disabled={busy} title={t.git.abortHint}>
            {t.git.abortMerge}
          </button>
          <button className="primary" disabled={!resolution || busy || markersLeft} onClick={() => void accept()}>
            {busy && resolution ? t.git.pushing : t.git.acceptPush}
          </button>
        </div>
      </div>
    </div>
  )
}
