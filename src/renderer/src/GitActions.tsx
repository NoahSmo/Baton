import { useEffect, useRef, useState } from 'react'
import type { Feature, GitStatus } from '../../shared/types'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'

interface Props {
  feature: Feature
  git: GitStatus | null
}

/** Pull, push and commit of the feature's worktree, as buttons next to its branch. */
export function GitActions({ feature, git }: Props) {
  const t = useT()
  const [running, setRunning] = useState<'pull' | 'push' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)

  if (!git || !git.branch) return null

  async function run(action: 'pull' | 'push') {
    setRunning(action)
    setError(null)
    try {
      await (action === 'pull' ? window.api.gitPull(feature.id) : window.api.gitPush(feature.id))
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setRunning(null)
    }
  }

  const canPull = Boolean(git.upstream) && !running
  // A branch without upstream is published by its first push.
  const canPush = (git.ahead > 0 || !git.upstream) && !running

  return (
    <>
      <span className="sep">·</span>
      <span className="git-actions">
        <button className="git-action" disabled={!canPull} title={git.upstream ? t.git.pullHint(git.upstream) : undefined} onClick={() => void run('pull')}>
          {running === 'pull' ? t.git.pulling : `↓ ${t.git.pull}${git.behind > 0 ? ` ${git.behind}` : ''}`}
        </button>
        <button className="git-action" disabled={!canPush} title={git.upstream ? t.git.pushHint : t.git.publishHint} onClick={() => void run('push')}>
          {running === 'push' ? t.git.pushing : `↑ ${t.git.push}${git.ahead > 0 ? ` ${git.ahead}` : ''}`}
        </button>
        <button className="git-action" disabled={!git.changes.length || Boolean(running)} onClick={() => setCommitting(true)}>
          {t.git.commit}
        </button>
      </span>
      {error && (
        <span className="git-error" title={error} role="alert">
          {error}
          <button className="link" onClick={() => setError(null)} aria-label={t.permission.dismiss}>
            ×
          </button>
        </span>
      )}
      {committing && <CommitDialog feature={feature} git={git} onClose={() => setCommitting(false)} />}
    </>
  )
}

function CommitDialog({ feature, git, onClose }: { feature: Feature; git: GitStatus; onClose(): void }) {
  const t = useT()
  const [checked, setChecked] = useState(() => new Set(git.changes.map((c) => c.path)))
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drafting, setDrafting] = useState(false)
  const latest = useRef(0)
  const pathsRef = useRef<string[]>([])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  // The status moves while the dialog is open: a file that went away cannot stay selected.
  const present = new Set(git.changes.map((c) => c.path))
  const paths = [...checked].filter((p) => present.has(p))
  const all = paths.length === git.changes.length
  pathsRef.current = paths

  async function draft() {
    const run = ++latest.current
    setDrafting(true)
    setError(null)
    try {
      const text = await window.api.gitDraftCommit(feature.id, pathsRef.current)
      if (run !== latest.current) return
      if (!text) setError(t.git.draftFailed)
      else setMessage(text)
    } catch (err) {
      if (run === latest.current) setError(cleanError(err))
    } finally {
      if (run === latest.current) setDrafting(false)
    }
  }

  // Claude only words the commit when asked; a draft still running is dropped with the dialog.
  useEffect(() => {
    return () => {
      latest.current++
      window.api.cancelGitDraftCommit(feature.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggle(path: string) {
    const next = new Set(checked)
    if (!next.delete(path)) next.add(path)
    setChecked(next)
  }

  async function commit() {
    setBusy(true)
    setError(null)
    try {
      await window.api.gitCommit(feature.id, message, paths)
      onClose()
    } catch (err) {
      setError(cleanError(err))
      setBusy(false)
    }
  }

  const ready = paths.length > 0 && message.trim().length > 0 && !busy

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dialog commit-dialog" role="dialog" aria-labelledby="commit-title">
        <h2 id="commit-title">{t.git.commitTitle}</h2>
        <p className="hint">{t.git.commitHint}</p>
        <div className="commit-head">
          <label>{t.git.commitMessage}</label>
          <button className="link" disabled={drafting || busy || !paths.length} onClick={() => void draft()}>
            {drafting ? t.git.drafting : message.trim() ? t.git.redraft : t.git.draft}
          </button>
        </div>
        <textarea
          autoFocus
          rows={5}
          value={message}
          placeholder={drafting ? t.git.drafting : undefined}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && ready && void commit()}
        />
        <div className="commit-head">
          <label className="commit-row">
            <input
              type="checkbox"
              checked={all}
              onChange={() => setChecked(all ? new Set() : new Set(git.changes.map((c) => c.path)))}
            />
            {t.git.selectAll}
          </label>
          <span className="hint">{t.git.selected(paths.length, git.changes.length)}</span>
        </div>
        <div className="commit-list">
          {git.changes.map((c) => (
            <label key={c.path} className="commit-row" title={c.from ? `${c.from} → ${c.path}` : c.path}>
              <input type="checkbox" checked={checked.has(c.path)} onChange={() => toggle(c.path)} />
              <span className={`commit-kind ${c.kind}`}>{t.git.kind[c.kind]}</span>
              <span className="commit-path">{c.path}</span>
            </label>
          ))}
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions">
          <button onClick={onClose} disabled={busy}>
            {t.common.cancel}
          </button>
          <button className="primary" disabled={!ready} onClick={() => void commit()}>
            {busy ? t.git.committing : t.git.commit}
          </button>
        </div>
      </div>
    </div>
  )
}
