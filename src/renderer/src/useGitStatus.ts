import { useEffect, useState } from 'react'
import type { GitStatus } from '../../shared/types'

/** Git status of a feature's worktree, kept current while the feature is on screen. Null until known. */
export function useGitStatus(featureId: string | null): GitStatus | null {
  const [known, setKnown] = useState<{ featureId: string; status: GitStatus } | null>(null)

  useEffect(() => {
    if (!featureId) return
    let stale = false
    let running = false
    let again = false
    // An agent at work changes files faster than git reads them: one read at a time, then one more.
    async function refresh() {
      if (running) {
        again = true
        return
      }
      running = true
      do {
        again = false
        const status = await window.api.gitStatus(featureId!).catch(() => null)
        if (stale) return
        if (status) setKnown({ featureId: featureId!, status })
      } while (again)
      running = false
    }
    const onFocus = () => void refresh()

    void refresh()
    void window.api.gitWatch(featureId)
    const off = window.api.onGitChanged((id) => id === featureId && void refresh())
    // Pushes and fetches made elsewhere leave no trace the watcher sees.
    window.addEventListener('focus', onFocus)
    return () => {
      stale = true
      off()
      window.removeEventListener('focus', onFocus)
      void window.api.gitUnwatch(featureId)
    }
  }, [featureId])

  return known?.featureId === featureId ? known.status : null
}
