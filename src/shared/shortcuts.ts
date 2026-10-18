export type ShortcutAction =
  | 'newFeature'
  | 'prevFeature'
  | 'nextFeature'
  | 'toggleEditor'
  | 'approve'
  | 'nextWaiting'
  | 'searchSidebar'
  | 'searchConversation'
  | `project:${number}`

export interface KeyLike {
  key: string
  code: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/** Shortcuts shown in Settings, in this order. `project:n` stands for ⌘1 to ⌘9. */
export const SHORTCUT_LIST: ShortcutAction[] = [
  'newFeature',
  'nextWaiting',
  'prevFeature',
  'nextFeature',
  'project:1',
  'toggleEditor',
  'approve',
  'searchSidebar',
  'searchConversation'
]

/** The action a key press stands for. ⌘ on a Mac, Ctrl elsewhere. */
export function resolveShortcut(e: KeyLike, mac: boolean): ShortcutAction | null {
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
  if (!mod || e.altKey) return null
  const key = e.key.toLowerCase()
  if (e.shiftKey) {
    if (key === 'f') return 'searchSidebar'
    return null
  }
  const digit = /^Digit([1-9])$/.exec(e.code)
  if (digit) return `project:${Number(digit[1])}`
  switch (e.code) {
    case 'BracketLeft':
      return 'prevFeature'
    case 'BracketRight':
      return 'nextFeature'
    case 'Enter':
      return 'approve'
  }
  switch (key) {
    case 'n':
      return 'newFeature'
    case 'e':
      return 'toggleEditor'
    case 'j':
      return 'nextWaiting'
    case 'f':
      return 'searchConversation'
  }
  return null
}

const KEYS: Record<string, string> = {
  newFeature: 'N',
  prevFeature: '[',
  nextFeature: ']',
  toggleEditor: 'E',
  approve: '⏎',
  nextWaiting: 'J',
  searchSidebar: '⇧F',
  searchConversation: 'F',
  'project:1': '1…9'
}

/** "⌘N" on a Mac, "Ctrl+N" elsewhere. */
export function shortcutLabel(action: ShortcutAction, mac: boolean): string {
  const key = action.startsWith('project:') ? KEYS['project:1'] : KEYS[action]
  if (mac) return `⌘${key}`
  return `Ctrl+${key.replace('⇧', 'Shift+').replace('⏎', 'Enter')}`
}
