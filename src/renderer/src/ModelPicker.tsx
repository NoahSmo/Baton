import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AGENT_MODELS, FEATURED_AGENT_MODELS, type AgentModel } from '../../shared/types'
import { useT } from './i18n'
import { Icon } from './ui/Icon'

const MARGIN = 6

interface Props {
  value: AgentModel
  onChange(model: AgentModel): void
  /** Opens the list over the button rather than under it, for a button at the bottom of the window. */
  above?: boolean
}

/** The model an agent runs on, as a button listing the models to switch to. */
export function ModelPicker({ value, onChange, above }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [more, setMore] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  const others = AGENT_MODELS.filter((m) => !FEATURED_AGENT_MODELS.includes(m))

  function toggle() {
    setMore(false)
    setPosition(null)
    setOpen(!open)
  }

  function pick(model: AgentModel) {
    setOpen(false)
    if (model !== value) onChange(model)
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
  }, [open, more, above])

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

  const option = (model: AgentModel) => (
    <button
      key={model}
      type="button"
      role="option"
      aria-selected={model === value}
      className={`ctx-item model-item${model === value ? ' current' : ''}`}
      onClick={() => pick(model)}
    >
      <span className="model-text">
        <span className="model-name">{t.models[model].label}</span>
        <span className="model-hint">{t.models[model].hint}</span>
      </span>
      {model === value && <Icon name="check" size={14} />}
    </button>
  )

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`filter model-button${open ? ' selected' : ''}`}
        title={t.models[value].hint}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
      >
        {t.models[value].label}
        <span className="branch-caret"><Icon name="chevron-down" size={12} /></span>
      </button>
      {open && (
        <div ref={menu} className="ctx-menu model-menu" style={position ?? { left: 0, top: 0, visibility: 'hidden' }}>
          <div role="listbox" aria-label={t.newFeature.model}>
            {more ? (
              <>
                <button type="button" className="ctx-item model-back" onClick={() => setMore(false)}>
                  <Icon name="chevron-right" size={12} />
                  {t.modelPicker.back}
                </button>
                {others.map(option)}
              </>
            ) : (
              <>
                {FEATURED_AGENT_MODELS.map(option)}
                {others.length > 0 && (
                  <>
                    <div className="ctx-sep" />
                    <button type="button" className="ctx-item model-more" onClick={() => setMore(true)}>
                      {t.modelPicker.more}
                      <Icon name="chevron-right" size={12} />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
          <p className="model-note">{t.modelPicker.fableAccess}</p>
        </div>
      )}
    </>
  )
}
