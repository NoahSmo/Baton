import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { setMenuHost, showMenu, type OpenMenu } from './contextMenu'

const MARGIN = 6

/** Draws the one context menu that can be open at a time. */
export function ContextMenuHost() {
  const [open, setOpen] = useState<OpenMenu | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMenuHost((next) => {
      setOpen((current) => {
        current?.done(null)
        return next
      })
      setPosition(null)
    })
    const off = window.api.onMenuShow((menu, point) => showMenu(menu, point.x, point.y))
    return () => {
      setMenuHost(null)
      off()
    }
  }, [])

  function close(action: Parameters<OpenMenu['done']>[0] = null) {
    open?.done(action)
    setOpen(null)
  }

  // Measured after render so the menu never spills out of the window.
  useLayoutEffect(() => {
    if (!open || !ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    setPosition({
      left: Math.max(MARGIN, Math.min(open.x, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(open.y, window.innerHeight - height - MARGIN))
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const dismiss = () => close()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close()
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', dismiss)
    window.addEventListener('resize', dismiss)
    window.addEventListener('wheel', dismiss, true)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', dismiss)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('wheel', dismiss, true)
    }
  }, [open])

  if (!open) return null

  async function run(itemId: number) {
    const { menu } = open!
    close(await window.api.menuRun(menu.menuId, itemId))
  }

  return (
    <div
      ref={ref}
      className="ctx-menu"
      role="menu"
      style={position ?? { left: open.x, top: open.y, visibility: 'hidden' }}
      // Keeps focus and selection where they are, so Copy and Paste act on them.
      onMouseDown={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {open.menu.items.map((item, i) =>
        item.separator ? (
          <div key={i} className="ctx-sep" role="separator" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`ctx-item${item.danger ? ' danger' : ''}`}
            disabled={!item.enabled}
            onClick={() => void run(item.id)}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  )
}
