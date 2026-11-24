import { useMemo, useState } from 'react'
import { flatten, parseLayout, reconcile, type RailLayout } from '../../shared/railLayout'
import type { Project } from '../../shared/types'

const KEY = 'baton.railLayout'

/** The rail's arrangement of the projects, remembered in localStorage and kept in step with the projects that exist. */
export function useRailLayout(projects: Project[]) {
  const [stored, setStored] = useState<RailLayout>(() => parseLayout(localStorage.getItem(KEY)))
  const ids = projects.map((p) => p.id)
  const layout = useMemo(() => reconcile(stored, ids), [stored, ids.join('\n')])

  return {
    layout,
    /** Projects in the order the rail shows them, for the keyboard shortcuts and the palette. */
    order: useMemo(() => flatten(layout), [layout]),
    update(change: (layout: RailLayout) => RailLayout) {
      const next = change(layout)
      setStored(next)
      localStorage.setItem(KEY, JSON.stringify(next))
    }
  }
}

export type RailState = ReturnType<typeof useRailLayout>
