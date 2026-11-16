import { useEffect } from 'react'

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** Focus of the topmost open dialog: on its first field when it opens, and kept inside it by Tab. */
export function DialogFocus() {
  useEffect(() => {
    const top = () => [...document.querySelectorAll<HTMLElement>('.overlay .dialog')].pop()

    // Where focus was when each dialog opened, so closing one puts it back on the button that opened it.
    const origins = new Map<HTMLElement, HTMLElement | null>()
    let labelled = 0

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (!(node instanceof HTMLElement) || !origins.has(node)) continue
          const origin = origins.get(node)
          origins.delete(node)
          if (origin?.isConnected && !document.querySelector('.overlay .dialog')?.contains(document.activeElement)) origin.focus({ preventScroll: true })
        }
      }
      const added = records.flatMap((r) => [...r.addedNodes]).filter((n): n is HTMLElement => n instanceof HTMLElement)
      const overlay = added.find((n) => n.matches('.overlay') && n.querySelector('.dialog'))
      const dialog = overlay?.querySelector<HTMLElement>('.dialog')
      if (!overlay || !dialog) return
      origins.set(overlay, document.activeElement instanceof HTMLElement ? document.activeElement : null)
      // Dialogs without a role of their own are announced as dialogs too, named by their title.
      if (!dialog.hasAttribute('role')) dialog.setAttribute('role', 'dialog')
      dialog.setAttribute('aria-modal', 'true')
      const title = dialog.querySelector<HTMLElement>('h2')
      if (title && !dialog.hasAttribute('aria-labelledby')) {
        title.id ||= `dialog-title-${++labelled}`
        dialog.setAttribute('aria-labelledby', title.id)
      }
      if (dialog.contains(document.activeElement)) return
      // Fields first, so typing can start at once; the buttons only when the dialog has none.
      const target = dialog.querySelector<HTMLElement>('input:not(:disabled):not([type=checkbox]), textarea:not(:disabled)')
      ;(target ?? dialog.querySelector<HTMLElement>('button.primary, button.danger-fill') ?? dialog).focus({ preventScroll: true })
    })
    observer.observe(document.body, { childList: true, subtree: true })

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const dialog = top()
      if (!dialog) return
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!dialog.contains(active)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      observer.disconnect()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return null
}
