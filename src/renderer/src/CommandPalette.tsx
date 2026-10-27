import { useEffect, useMemo, useRef, useState } from 'react'
import { filterPalette, type PaletteItem } from '../../shared/palette'
import type { FeatureStatus } from '../../shared/types'
import { useT } from './i18n'

export interface PaletteEntry extends PaletteItem {
  group: 'agents' | 'projects' | 'commands'
  /** Dimmed text on the right: a project name, a shortcut. */
  hint?: string
  /** Status dot shown before an agent. */
  status?: FeatureStatus
  run(): void
}

interface Props {
  entries: PaletteEntry[]
  onClose(): void
}

/** ⌘K: one box to reach any agent or project, or to run a command, without the mouse. */
export function CommandPalette({ entries, onClose }: Props) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [at, setAt] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  // Grouped in the order each group's best hit is ranked, so ↑ ↓ walk the list as it reads.
  const { shown, groups } = useMemo(() => {
    const ranked = filterPalette(entries, query)
    const order = [...new Set(ranked.map((e) => e.group))]
    return { shown: order.flatMap((g) => ranked.filter((e) => e.group === g)), groups: order }
  }, [entries, query])
  const current = Math.min(at, shown.length - 1)

  useEffect(() => {
    list.current?.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' })
  }, [current, shown])

  function choose(entry: PaletteEntry | undefined) {
    if (!entry) return
    onClose()
    entry.run()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') return onClose()
    if (e.key === 'Enter') {
      // Not while an IME composition is being confirmed.
      if (e.nativeEvent.isComposing) return
      e.preventDefault()
      return choose(shown[current])
    }
    const step = e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n') ? 1 : e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p') ? -1 : 0
    if (!step || !shown.length) return
    e.preventDefault()
    setAt((current + step + shown.length) % shown.length)
  }

  return (
    <div className="overlay palette-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label={t.palette.label}>
        <input
          autoFocus
          value={query}
          placeholder={t.palette.placeholder}
          aria-label={t.palette.label}
          onChange={(e) => {
            setQuery(e.target.value)
            setAt(0)
          }}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list" ref={list}>
          {groups.map((group) => (
            <div key={group}>
              <div className="palette-group">{t.palette[group]}</div>
              {shown
                .filter((e) => e.group === group)
                .map((entry) => (
                  <div
                    key={entry.id}
                    role="button"
                    className={`palette-item${entry === shown[current] ? ' active' : ''}`}
                    onMouseMove={() => setAt(shown.indexOf(entry))}
                    onClick={() => choose(entry)}
                  >
                    {entry.status && <span className={`dot ${entry.status} still`} />}
                    <span className="palette-label">{entry.label}</span>
                    {entry.hint && <span className="palette-hint">{entry.hint}</span>}
                  </div>
                ))}
            </div>
          ))}
          {!shown.length && <p className="palette-none">{t.palette.none}</p>}
        </div>
      </div>
    </div>
  )
}
