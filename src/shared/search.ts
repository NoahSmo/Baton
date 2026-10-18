/** Start offsets of every occurrence of `query` in `text`, ignoring case. Occurrences do not overlap. */
export function findOccurrences(text: string, query: string): number[] {
  if (!query) return []
  const haystack = text.toLowerCase()
  const needle = query.toLowerCase()
  // Lowercasing can change a text's length (e.g. "İ"): offsets would then point elsewhere.
  if (haystack.length !== text.length) return []
  const found: number[] = []
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) found.push(at)
  return found
}
