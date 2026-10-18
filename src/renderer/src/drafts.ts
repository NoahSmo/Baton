const key = (featureId: string) => `baton.draft.${featureId}`

/** Text left in an agent's message box, kept across agent switches and restarts. */
export function loadDraft(featureId: string): string {
  try {
    return localStorage.getItem(key(featureId)) ?? ''
  } catch {
    return ''
  }
}

export function saveDraft(featureId: string, text: string): void {
  try {
    if (text) localStorage.setItem(key(featureId), text)
    else localStorage.removeItem(key(featureId))
  } catch {
    // Storage full or unavailable: the draft lives as long as the box does.
  }
}
