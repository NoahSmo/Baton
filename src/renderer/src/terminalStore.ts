import { FitAddon } from '@xterm/addon-fit'
import { Terminal, type ITheme } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { useSyncExternalStore } from 'react'
import { DEFAULT_THEME, type Theme } from '../../shared/themes'
import type { TerminalInfo, TerminalTarget } from '../../shared/types'

/**
 * A terminal outlives the panel that shows it: switching tabs or hiding the
 * panel unmounts components, while the shell and its scrollback stay here.
 */
export interface TerminalTab {
  info: TerminalInfo
  term: Terminal
  fit: FitAddon
  /** Element the terminal draws in, moved in and out of the panel. */
  el: HTMLDivElement
  opened: boolean
  /** What the terminal is listed as: its launch command, or its shell and rank. */
  label: string
}

/** Moves a hex color a share of the way towards another. */
function mix(from: string, to: string, share: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  return `#${[0, 1, 2]
    .map((i) => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * share).toString(16).padStart(2, '0'))
    .join('')}`
}

function terminalTheme({ colors: c, dark }: Theme): ITheme {
  // Bright colors stand further out from the background: lighter on a dark one, darker on a light one.
  const bright = (color: string) => mix(color, dark ? '#ffffff' : '#000000', 0.22)
  return {
    background: c.bg,
    foreground: c.text,
    cursor: c.accent,
    cursorAccent: c.bg,
    selectionBackground: c.borderStrong,
    black: dark ? c.raised : c.text,
    red: c.red,
    green: c.green,
    yellow: c.amber,
    blue: c.blue,
    magenta: c.purple,
    cyan: c.cyan,
    white: dark ? c.punct : c.muted,
    brightBlack: c.muted,
    brightRed: bright(c.red),
    brightGreen: bright(c.green),
    brightYellow: bright(c.amber),
    brightBlue: bright(c.blue),
    brightMagenta: bright(c.purple),
    brightCyan: bright(c.cyan),
    brightWhite: dark ? c.text : c.punct
  }
}

let theme = terminalTheme(DEFAULT_THEME)

let tabs: TerminalTab[] = []
const listeners = new Set<() => void>()
/** Projects and features whose first terminal is being started, so it is not started twice. */
const starting = new Set<string>()
/** The terminal each feature or project last put forward. */
let shown: Record<string, string> = {}
/** Shells opened so far for each feature or project, which numbers the next one. */
const shellCounts = new Map<string, number>()
let wired = false

function keyOf(target: TerminalTarget): string {
  return 'featureId' in target ? target.featureId : target.projectId
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function publish(next: TerminalTab[]): void {
  tabs = next
  listeners.forEach((listener) => listener())
}

function wire(): void {
  if (wired) return
  wired = true
  window.api.onTerminalData((id, data) => tabs.find((tab) => tab.info.id === id)?.term.write(data))
  window.api.onTerminalExit((id) => {
    const tab = tabs.find((t) => t.info.id === id)
    if (!tab) return
    tab.term.dispose()
    tab.el.remove()
    publish(tabs.filter((t) => t !== tab))
  })
}

/** Opens a terminal and puts it forward; with `commandId`, it runs that launch command of the project. */
export async function openTerminal(target: TerminalTarget, commandId?: string): Promise<TerminalTab> {
  wire()
  const info = await window.api.terminalOpen(target, commandId)
  const term = new Terminal({
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    fontSize: 12,
    lineHeight: 1.25,
    cursorBlink: true,
    scrollback: 5000,
    macOptionIsMeta: true,
    theme
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.onData((data) => window.api.terminalWrite(info.id, data))
  term.onResize(({ cols, rows }) => window.api.terminalResize(info.id, cols, rows))
  const el = document.createElement('div')
  el.className = 'terminal-screen'
  const key = keyOf(target)
  let label = info.command
  if (!label) {
    const rank = (shellCounts.get(key) ?? 0) + 1
    shellCounts.set(key, rank)
    label = `${info.shell}-${rank}`
  }
  const tab: TerminalTab = { info, term, fit, el, opened: false, label }
  shown = { ...shown, [key]: info.id }
  publish([...tabs, tab])
  return tab
}

/** Makes a terminal the one its panel shows. */
export function showTerminal(tab: TerminalTab): void {
  shown = { ...shown, [tab.info.featureId ?? tab.info.projectId]: tab.info.id }
  publish(tabs)
}

/** Whether a terminal was opened for this target: a feature's worktree, or the project folder itself. */
export function inTarget(info: TerminalInfo, target: TerminalTarget): boolean {
  return 'featureId' in target
    ? info.featureId === target.featureId
    : info.projectId === target.projectId && !info.featureId
}

/** Opens the first terminal of a target, unless it has one or one is on its way. */
export async function ensureTerminal(target: TerminalTarget): Promise<void> {
  const key = keyOf(target)
  if (starting.has(key) || tabs.some((tab) => inTarget(tab.info, target))) return
  starting.add(key)
  try {
    await openTerminal(target)
  } finally {
    starting.delete(key)
  }
}

/** The tab goes away once the main process confirms the shell is gone. */
export function closeTerminal(id: string): void {
  void window.api.terminalClose(id)
}

/** Puts a terminal on screen inside `host`; it starts drawing the first time. */
export function attachTerminal(tab: TerminalTab, host: HTMLElement): void {
  host.appendChild(tab.el)
  if (!tab.opened) {
    // xterm measures its font on open, which needs the element in the document.
    tab.term.open(tab.el)
    tab.opened = true
  }
  fitTerminal(tab)
  tab.term.focus()
}

export function fitTerminal(tab: TerminalTab): void {
  // Nothing to measure while the panel is hidden.
  if (tab.el.clientWidth > 0 && tab.el.clientHeight > 0) tab.fit.fit()
}

/** Recolors the open terminals, and the ones opened from now on. */
export function setTerminalTheme(next: Theme): void {
  theme = terminalTheme(next)
  tabs.forEach((tab) => (tab.term.options.theme = theme))
}

export function useTerminals(): TerminalTab[] {
  return useSyncExternalStore(subscribe, () => tabs)
}

/** The terminal a target's panel shows: the one last put forward, the latest otherwise. */
export function useShownTerminal(target: TerminalTarget): TerminalTab | null {
  const mine = useTerminals().filter((tab) => inTarget(tab.info, target))
  const id = useSyncExternalStore(subscribe, () => shown[keyOf(target)] ?? null)
  return mine.find((tab) => tab.info.id === id) ?? mine.at(-1) ?? null
}
