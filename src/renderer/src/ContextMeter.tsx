import { useEffect, useRef, useState } from 'react'
import { contextRows, type ContextRow, type ContextUsage } from '../../shared/context'
import { kTokens } from '../../shared/i18n'
import type { Feature } from '../../shared/types'
import { useT } from './i18n'
import { Icon } from './ui/Icon'

/** Color of a row, by its stable id; rows the app does not know yet stay neutral. */
const COLORS: Record<string, string> = {
  messages: 'var(--blue)',
  mcp_tools: 'var(--orange)',
  system_tools: 'var(--green)',
  system_prompt: 'var(--amber)',
  custom_agents: 'var(--purple)',
  skills: 'var(--cyan)',
  mcp_instructions: 'var(--muted)',
  memory_files: 'var(--faint)'
}
const colorOf = (row: ContextRow) => (row.kind === 'used' ? (COLORS[row.id ?? ''] ?? 'var(--muted)') : undefined)

const percent = (share: number) => `${share < 10 ? share.toFixed(1) : Math.round(share)} %`

/** The window as one bar: a segment per category in use, then the compaction reserve, hatched. */
function UsageBar({ rows, reserve }: { rows: ContextRow[]; reserve: number }) {
  return (
    <span className="ctx-bar" aria-hidden="true">
      {rows.map((row) => (
        <span key={row.id ?? row.name} style={{ width: `${row.share}%`, background: colorOf(row) }} />
      ))}
      {reserve > 0 && <span className="ctx-bar-reserve" style={{ width: `${reserve}%` }} />}
    </span>
  )
}

/** Header gauge of the agent's context window; opens a card with what fills it, like /context. */
export function ContextMeter({ feature, onContinue }: { feature: Feature; onContinue(): void }) {
  const t = useT()
  const [usage, setUsage] = useState<ContextUsage | null>(null)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const heavy = feature.contextTokens > 100_000

  // Asked again after every turn (the size moves) and on opening; null while the agent's process is down.
  useEffect(() => {
    let stale = false
    window.api
      .contextUsage(feature.id)
      .then((next) => !stale && next && setUsage(next))
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [feature.id, feature.contextTokens, open])

  useEffect(() => setUsage(null), [feature.id])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const rows = usage ? contextRows(usage) : null
  const reserve = rows?.rest.filter((r) => r.kind === 'buffer').reduce((sum, r) => sum + (r.share ?? 0), 0) ?? 0
  const name = (row: ContextRow) => (row.id && t.contextCard.rows[row.id]) || row.name

  return (
    <div className="stat ctx" ref={root}>
      <button className="ctx-trigger" aria-expanded={open} aria-haspopup="dialog" title={t.feature.contextSize} onClick={() => setOpen((v) => !v)}>
        <span className="stat-label">{t.feature.context}</span>
        <span className={`stat-value num${heavy ? ' heavy' : ''}`}>
          {usage ? `${usage.percentage} %` : kTokens(feature.contextTokens)}
        </span>
        {rows && <UsageBar rows={rows.used} reserve={reserve} />}
      </button>
      {heavy && feature.sessionId && (
        <button className="link" title={t.handoff.heavy} onClick={onContinue}>
          {t.handoff.button}
        </button>
      )}

      {open && (
        <div className="ctx-card" role="dialog" aria-label={t.contextCard.title}>
          <h3 className="ctx-title">{t.contextCard.title}</h3>
          {!usage || !rows ? (
            <>
              <p className="ctx-total">
                <span className="num">{kTokens(feature.contextTokens)}</span>
              </p>
              <p className="ctx-empty">{t.contextCard.offline}</p>
            </>
          ) : (
            <>
              <p className="ctx-total">
                <span>{t.contextCard.used(usage.percentage)}</span>
                <span className="num ctx-muted">
                  {kTokens(usage.totalTokens)} / {kTokens(usage.maxTokens)}
                </span>
              </p>
              <UsageBar rows={rows.used} reserve={reserve} />
              <ul className="ctx-rows">
                {rows.used.map((row) => (
                  <Row key={row.id ?? row.name} row={row} name={name(row)} color={colorOf(row)} />
                ))}
              </ul>
              {rows.rest.length > 0 && (
                <ul className="ctx-rows">
                  {rows.rest.map((row) => (
                    <Row key={row.id ?? row.name} row={row} name={name(row)} />
                  ))}
                </ul>
              )}
              {rows.deferred.length > 0 && (
                <ul className="ctx-rows ctx-deferred" title={t.contextCard.deferredHint}>
                  {rows.deferred.map((row) => (
                    <Row key={row.id ?? row.name} row={row} name={name(row)} />
                  ))}
                </ul>
              )}
              <Details label={t.contextCard.mcpTools} items={usage.mcpServers} />
              <Details label={t.contextCard.memoryFiles} items={usage.memoryFiles.map((f) => ({ name: f.path.split('/').slice(-2).join('/'), tokens: f.tokens, title: f.path }))} />
              <Details label={t.contextCard.skills} items={usage.skills} />
              <p className="ctx-model">{usage.model}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ row, name, color }: { row: ContextRow; name: string; color?: string }) {
  return (
    <li className={`ctx-row ${row.kind}`}>
      <span className="ctx-swatch" style={color ? { background: color } : undefined} aria-hidden="true" />
      <span className="ctx-name">{name}</span>
      <span className="num ctx-muted">{kTokens(row.tokens)}</span>
      <span className="num ctx-share">{row.share === null ? '—' : percent(row.share)}</span>
    </li>
  )
}

/** A folded list under the rows: tools by server, memory files, skills. */
function Details({ label, items }: { label: string; items: { name: string; tokens: number; title?: string }[] }) {
  if (!items.length) return null
  return (
    <details className="ctx-details">
      <summary>
        <Icon name="chevron-right" size={10} />
        <span className="ctx-name">{label}</span>
        <span className="num ctx-muted">{items.length}</span>
      </summary>
      <ul>
        {items.map((item) => (
          <li key={item.title ?? item.name} title={item.title}>
            <span className="ctx-name">{item.name}</span>
            <span className="num ctx-muted">{kTokens(item.tokens)}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
