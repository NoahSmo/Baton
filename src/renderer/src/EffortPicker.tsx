import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AGENT_EFFORTS, type AgentEffort } from '../../shared/types'
import { useT } from './i18n'
import { Icon } from './ui/Icon'

const MARGIN = 6

interface Props {
  /** Null leaves the effort to the model's own default. */
  value: AgentEffort | null
  onChange(effort: AgentEffort | null): void
  /** Opens the list over the button rather than under it, for a button at the bottom of the window. */
  above?: boolean
}

/** How hard the model thinks, as a button listing the levels to switch to. */
export function EffortPicker({ value, onChange, above }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  const levels: (AgentEffort | null)[] = [null, ...AGENT_EFFORTS]
  const key = (effort: AgentEffort | null) => effort ?? 'default'

  function toggle() {
    setPosition(null)
    setOpen(!open)
  }

  function pick(effort: AgentEffort | null) {
    setOpen(false)
    if (effort !== value) onChange(effort)
  }

  // Measured after render so the list never spills out of the window.
  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) return
    const anchor = button.current.getBoundingClientRect()
    const { width, height } = menu.current.getBoundingClientRect()
    setPosition({
      left: Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(above ? anchor.top - height - 4 : anchor.bottom + 4, window.innerHeight - height - MARGIN))
    })
  }, [open, above])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!menu.current?.contains(target) && !button.current?.contains(target)) close()
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`filter model-button${open ? ' selected' : ''}`}
        title={t.efforts[key(value)].hint}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
      >
        {t.efforts[key(value)].label}
        <span className="branch-caret"><Icon name="chevron-down" size={12} /></span>
      </button>
      {open && (
        <div ref={menu} className="ctx-menu model-menu" style={position ?? { left: 0, top: 0, visibility: 'hidden' }}>
          <div role="listbox" aria-label={t.newFeature.effort}>
            {levels.map((effort) => (
              <button
                key={key(effort)}
                type="button"
                role="option"
                aria-selected={effort === value}
                className={`ctx-item model-item${effort === value ? ' current' : ''}`}
                onClick={() => pick(effort)}
              >
                <span className="model-text">
                  <span className="model-name">{t.efforts[key(effort)].label}</span>
                  <span className="model-hint">{t.efforts[key(effort)].hint}</span>
                </span>
                {effort === value && <Icon name="check" size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
