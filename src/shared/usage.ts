import type { Feature, Project, TurnCost } from './types'

export interface DayCost {
  /** Local date, "2026-10-18". */
  day: string
  costUsd: number
}

export interface CostRow {
  id: string
  name: string
  costUsd: number
}

export interface UsageSummary {
  /** The last `days` days, oldest first, empty days included. */
  byDay: DayCost[]
  byProject: CostRow[]
  byFeature: CostRow[]
  totalUsd: number
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar day of a moment. */
export function dayKey(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Costs of the turns within the last `days` days, by day, project and feature. */
export function summarizeUsage(
  turns: TurnCost[],
  features: Pick<Feature, 'id' | 'title' | 'projectId'>[],
  projects: Pick<Project, 'id' | 'name'>[],
  now: number,
  days: number
): UsageSummary {
  const keys: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    keys.push(dayKey(d.getTime()))
  }
  const perDay = new Map(keys.map((k) => [k, 0]))
  const perFeature = new Map<string, number>()
  const perProject = new Map<string, number>()
  const featureById = new Map(features.map((f) => [f.id, f]))
  let total = 0

  for (const turn of turns) {
    const key = dayKey(turn.at)
    if (!perDay.has(key)) continue
    perDay.set(key, perDay.get(key)! + turn.costUsd)
    total += turn.costUsd
    perFeature.set(turn.featureId, (perFeature.get(turn.featureId) ?? 0) + turn.costUsd)
    const projectId = featureById.get(turn.featureId)?.projectId
    if (projectId) perProject.set(projectId, (perProject.get(projectId) ?? 0) + turn.costUsd)
  }

  const rows = (costs: Map<string, number>, name: (id: string) => string | undefined): CostRow[] =>
    [...costs]
      .flatMap(([id, costUsd]) => {
        const label = name(id)
        return label === undefined ? [] : [{ id, name: label, costUsd }]
      })
      .sort((a, b) => b.costUsd - a.costUsd)

  return {
    byDay: keys.map((day) => ({ day, costUsd: perDay.get(day)! })),
    byProject: rows(perProject, (id) => projects.find((p) => p.id === id)?.name),
    byFeature: rows(perFeature, (id) => featureById.get(id)?.title),
    totalUsd: total
  }
}
