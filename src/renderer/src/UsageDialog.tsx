import { useEffect, useMemo, useState } from 'react'
import type { Feature, Project, TurnCost } from '../../shared/types'
import { summarizeUsage, type CostRow } from '../../shared/usage'
import { useT } from './i18n'

interface Props {
  projects: Project[]
  features: Feature[]
  onClose(): void
}

const PERIODS = [7, 14, 30] as const

/** What the agents cost, per day, per project and per agent. */
export function UsageDialog({ projects, features, onClose }: Props) {
  const t = useT()
  const [turns, setTurns] = useState<TurnCost[] | null>(null)
  const [days, setDays] = useState<(typeof PERIODS)[number]>(14)

  useEffect(() => {
    void window.api.turnCosts().then(setTurns)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const summary = useMemo(() => summarizeUsage(turns ?? [], features, projects, Date.now(), days), [turns, features, projects, days])
  const peak = Math.max(0.0001, ...summary.byDay.map((d) => d.costUsd))

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog usage-dialog" role="dialog" aria-labelledby="usage-title">
        <div className="commit-head">
          <h2 id="usage-title">{t.usage.title}</h2>
          <span className="lang-switch" role="group" aria-label={t.usage.title}>
            {PERIODS.map((n) => (
              <button key={n} className={n === days ? 'selected' : ''} aria-pressed={n === days} onClick={() => setDays(n)}>
                {n}
              </button>
            ))}
          </span>
        </div>
        <p className="usage-total">
          <span className="hint">
            {t.usage.lastDays(days)} · {t.usage.total}
          </span>{' '}
          <span className="num strong">${summary.totalUsd.toFixed(2)}</span>
        </p>

        {turns && summary.totalUsd === 0 ? (
          <p className="hint">{t.usage.none}</p>
        ) : (
          <>
            <h3 className="usage-title">{t.usage.byDay}</h3>
            <div className="usage-days" role="img" aria-label={t.usage.byDay}>
              {summary.byDay.map((d) => (
                <div key={d.day} className="usage-day" title={`${d.day} · $${d.costUsd.toFixed(2)}`}>
                  <span style={{ height: `${(d.costUsd / peak) * 100}%` }} />
                </div>
              ))}
            </div>
            <Rows title={t.usage.byProject} rows={summary.byProject} total={summary.totalUsd} />
            <Rows title={t.usage.byAgent} rows={summary.byFeature.slice(0, 10)} total={summary.totalUsd} />
          </>
        )}
        <p className="hint">{t.usage.note}</p>
        <div className="dialog-actions">
          <span className="spacer" />
          <button onClick={onClose}>{t.update.close}</button>
        </div>
      </div>
    </div>
  )
}

function Rows({ title, rows, total }: { title: string; rows: CostRow[]; total: number }) {
  if (!rows.length) return null
  return (
    <>
      <h3 className="usage-title">{title}</h3>
      <div className="usage-rows">
        {rows.map((r) => (
          <div key={r.id} className="usage-row">
            <span className="usage-name" title={r.name}>
              {r.name}
            </span>
            <span className="usage-bar">
              <span style={{ width: `${total ? (r.costUsd / total) * 100 : 0}%` }} />
            </span>
            <span className="num">${r.costUsd.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </>
  )
}
