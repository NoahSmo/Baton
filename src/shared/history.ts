/** Where the user is in the messages they sent before, using ↑ and ↓ in the message box. */
export interface HistoryCursor {
  /** Index in the history of the message shown; null while the user types their own text. */
  index: number | null
  /** What was typed before browsing started, brought back at the bottom. */
  saved: string
}

export const START: HistoryCursor = { index: null, saved: '' }

/** Whether ↑/↓ browse the history rather than move the caret: only from the edge of the text. */
export function atEdge(text: string, caret: number, direction: 'up' | 'down'): boolean {
  return direction === 'up' ? !text.slice(0, caret).includes('\n') : !text.slice(caret).includes('\n')
}

/**
 * One step through the history (oldest first). Returns null when there is nowhere to go,
 * so the key keeps its usual effect.
 */
export function stepHistory(
  cursor: HistoryCursor,
  history: string[],
  text: string,
  direction: 'up' | 'down'
): { cursor: HistoryCursor; text: string } | null {
  if (direction === 'up') {
    if (!history.length) return null
    if (cursor.index === null) return { cursor: { index: history.length - 1, saved: text }, text: history[history.length - 1] }
    if (cursor.index === 0) return null
    return { cursor: { ...cursor, index: cursor.index - 1 }, text: history[cursor.index - 1] }
  }
  if (cursor.index === null) return null
  if (cursor.index >= history.length - 1) return { cursor: START, text: cursor.saved }
  return { cursor: { ...cursor, index: cursor.index + 1 }, text: history[cursor.index + 1] }
}

/** Messages sent, oldest first, without immediate repeats. */
export function sentMessages(events: { event: { kind: string; text?: string } }[]): string[] {
  const out: string[] = []
  for (const { event } of events) {
    const text = event.kind === 'user' ? event.text?.trim() : ''
    if (text && out[out.length - 1] !== text) out.push(text)
  }
  return out
}
