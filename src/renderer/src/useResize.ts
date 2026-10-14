import { useState, type PointerEvent } from 'react'

interface Options {
  /** localStorage key the size is remembered under. */
  key: string
  initial: number
  min: number
  /** Evaluated on each move, since it depends on the window size. */
  max(): number
  /** Which edge of the panel the handle sits on: dragging it away from the panel shrinks it. */
  edge: 'left' | 'top'
}

/** Size of a panel the user resizes by dragging a handle on one of its edges. */
export function useResize({ key, initial, min, max, edge }: Options): [number, (e: PointerEvent<HTMLElement>) => void] {
  const [size, setSize] = useState(() => Number(localStorage.getItem(key)) || initial)

  function onPointerDown(e: PointerEvent<HTMLElement>) {
    e.preventDefault()
    const handle = e.currentTarget
    const origin = edge === 'left' ? e.clientX : e.clientY
    const start = size
    let latest = start
    // Captured, so the drag keeps going over the editor and the terminal.
    handle.setPointerCapture(e.pointerId)
    handle.classList.add('dragging')

    const onMove = (move: globalThis.PointerEvent) => {
      const delta = origin - (edge === 'left' ? move.clientX : move.clientY)
      latest = Math.round(Math.max(min, Math.min(max(), start + delta)))
      setSize(latest)
    }
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
      handle.classList.remove('dragging')
      localStorage.setItem(key, String(latest))
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  // A window made smaller since the last drag must not leave the panel oversized.
  return [Math.max(min, Math.min(max(), size)), onPointerDown]
}
