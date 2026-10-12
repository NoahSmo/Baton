import type { ContextMenuSpec, MenuAction, MenuModel } from '../../shared/types'

export interface OpenMenu {
  menu: MenuModel
  x: number
  y: number
  /** Settles the promise of whoever opened the menu; called exactly once. */
  done(action: MenuAction | null): void
}

let host: ((open: OpenMenu) => void) | null = null

/** Registered by the single component that draws menus. */
export function setMenuHost(fn: ((open: OpenMenu) => void) | null): void {
  host = fn
}

export function showMenu(menu: MenuModel, x: number, y: number, done: OpenMenu['done'] = () => {}): void {
  if (host && menu.items.length) host({ menu, x, y, done })
  else done(null)
}

/**
 * Opens the context menu of a target at the pointer. Resolves with the picked
 * action when it is one the renderer has to carry out, with null otherwise.
 */
export async function openContextMenu(
  e: { clientX: number; clientY: number; preventDefault(): void },
  spec: ContextMenuSpec
): Promise<MenuAction | null> {
  e.preventDefault()
  const { clientX, clientY } = e
  const menu = await window.api.menuOpen(spec)
  return new Promise((resolve) => showMenu(menu, clientX, clientY, resolve))
}
