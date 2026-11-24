import { useEffect, useState } from 'react'
import type { Feature, MergeMethod, PullRequestStatus } from '../../shared/types'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'

const POLL_MS = 30_000

/** Whether the pull request can be merged now, and why not when it cannot. */
export function mergeBlock(pr: PullRequestStatus, t: ReturnType<typeof useT>): string | null {
  if (pr.state !== 'open') return t.pr.state[pr.state]
  if (pr.draft) return t.pr.draftState
  if (pr.mergeable === false) return t.pr.conflicts
  if (pr.checks.failed > 0) return t.pr.checks(pr.checks.passed, pr.checks.failed, pr.checks.pending)
  if (pr.review === 'changes') return t.pr.review.changes
  return null
}

/** State, checks and review of a feature's pull request, with a way to merge it. Refreshes while it is on screen. */
export function PullRequestStatusCard({ feature, version }: { feature: Feature; version: unknown }) {
  const t = useT()
  const [pr, setPr] = useState<PullRequestStatus | null>(null)
  const [method, setMethod] = useState<MergeMethod>('squash')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!feature.prUrl) return setPr(null)
    let stale = false
    window.api
      .pullRequestStatus(feature.id)
      .then((status) => !stale && setPr(status))
      .catch(() => !stale && setPr(null))
    return () => {
      stale = true
    }
  }, [feature.id, feature.prUrl, version, tick])

  useEffect(() => {
    if (!feature.prUrl) return
    const timer = setInterval(() => setTick((n) => n + 1), POLL_MS)
    return () => clearInterval(timer)
  }, [feature.prUrl])

  if (!feature.prUrl || !pr) return null
  const blocked = mergeBlock(pr, t)

  async function merge() {
    setBusy(true)
    setError(null)
    try {
      await window.api.mergePullRequest(feature.id, method)
      setTick((n) => n + 1)
    } catch (err) {
      setError(`${t.pr.mergeFailed} ${cleanError(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="pr-status" aria-label={`#${pr.number}`}>
      <p className="pr-status-head">
        <a href={pr.url} target="_blank" rel="noreferrer" title={t.pr.open}>
          #{pr.number}
        </a>
        <span className={`pr-state ${pr.draft && pr.state === 'open' ? 'draft' : pr.state}`}>
          {pr.draft && pr.state === 'open' ? t.pr.draftState : t.pr.state[pr.state]}
        </span>
      </p>
      <ul className="pr-facts">
        <li className={pr.checks.failed ? 'bad' : pr.checks.pending ? 'wait' : 'ok'}>{t.pr.checks(pr.checks.passed, pr.checks.failed, pr.checks.pending)}</li>
        {pr.review && <li className={pr.review === 'approved' ? 'ok' : pr.review === 'changes' ? 'bad' : 'wait'}>{t.pr.review[pr.review]}</li>}
        {pr.mergeable === false && <li className="bad">{t.pr.conflicts}</li>}
      </ul>
      {pr.state === 'open' && (
        <div className="pr-merge">
          <select value={method} aria-label={t.pr.mergeMethod} onChange={(e) => setMethod(e.target.value as MergeMethod)}>
            {(['squash', 'merge', 'rebase'] as const).map((m) => (
              <option key={m} value={m}>
                {t.pr.methods[m]}
              </option>
            ))}
          </select>
          <button className="primary" disabled={busy || blocked !== null} title={blocked ?? undefined} onClick={() => void merge()}>
            {busy ? t.pr.merging : t.pr.merge}
          </button>
        </div>
      )}
      {error && <p className="note error">{error}</p>}
    </section>
  )
}
