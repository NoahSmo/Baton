export interface PaletteItem {
  id: string
  label: string
  /** Extra words the query may match, such as a branch or a project name. */
  keywords?: string
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * Items matching every word of the query, best first: a label starting with
 * the query beats one containing it, which beats a hit in the keywords only.
 * Ties keep their original order. An empty query keeps everything.
 */
export function filterPalette<T extends PaletteItem>(items: T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return items
  const scored: { item: T; score: number; index: number }[] = []
  items.forEach((item, index) => {
    const label = fold(item.label)
    const haystack = `${label} ${fold(item.keywords ?? '')}`
    if (!words.every((w) => haystack.includes(w))) return
    const score = label.startsWith(words[0]) ? 0 : words.every((w) => label.includes(w)) ? 1 : 2
    scored.push({ item, score, index })
  })
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((s) => s.item)
}
