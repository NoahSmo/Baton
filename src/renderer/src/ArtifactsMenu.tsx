import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Artifact } from './artifacts'
import { useT } from './i18n'
import { Icon } from './ui/Icon'

const MARGIN = 6

/** Artifacts open in the browser, where the claude.ai session lives: the window handler sends them there. */
export function openArtifact(url: string) {
  window.open(url, '_blank')
}

/** The artifacts a turn published, as cards under its tool calls, visible even when the calls are folded. */
export function ArtifactCards({ artifacts }: { artifacts: Artifact[] }) {
  const t = useT()
  return (
    <div className="artifact-cards">
      {artifacts.map((artifact) => (
        <button key={artifact.url} type="button" className="artifact-card" title={artifact.url} onClick={() => openArtifact(artifact.url)}>
          <span className="artifact-icon">
            <Icon name="artifact" size={14} />
          </span>
          <span className="artifact-text">
            <span className="artifact-title">{artifact.title}</span>
            <span className="artifact-kind">{t.artifacts.kind}</span>
          </span>
          <span className="artifact-open">{t.artifacts.open}</span>
        </button>
      ))}
    </div>
  )
}

/** Every artifact of the conversation, behind one button in the feature's header. */
export function ArtifactsMenu({ artifacts }: { artifacts: Artifact[] }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  // Measured after render so the list never spills out of the window.
  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) return
    const anchor = button.current.getBoundingClientRect()
    const { width, height } = menu.current.getBoundingClientRect()
    setPosition({
      left: Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(anchor.bottom + 4, window.innerHeight - height - MARGIN))
    })
  }, [open, artifacts.length])

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

  if (!artifacts.length) return null

  return (
    <>
      <span className="sep">·</span>
      <button
        ref={button}
        type="button"
        className="link artifacts-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setPosition(null)
          setOpen(!open)
        }}
      >
        {t.artifacts.count(artifacts.length)}
      </button>
      {open && (
        <div ref={menu} role="menu" aria-label={t.artifacts.title} className="ctx-menu artifacts-menu" style={position ?? { left: 0, top: 0, visibility: 'hidden' }}>
          {artifacts.map((artifact) => (
            <button
              key={artifact.url}
              type="button"
              role="menuitem"
              className="ctx-item artifacts-item"
              title={artifact.url}
              onClick={() => {
                setOpen(false)
                openArtifact(artifact.url)
              }}
            >
              <Icon name="artifact" size={14} />
              <span className="artifacts-item-title">{artifact.title}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
