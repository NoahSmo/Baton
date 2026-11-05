import type { LinearIssue, LinearLabel, LinearProject, LinearProjectLink, Project } from './types'

/** First message sent to the agent for a feature created from an issue. */
export function issuePrompt(issue: LinearIssue): string {
  return [`${issue.identifier}: ${issue.title}`, issue.description?.trim(), `Linear issue: ${issue.url}`]
    .filter(Boolean)
    .join('\n\n')
}

/** Repositories serving a Linear project, the main one first. */
export function reposForLinearProject(projects: readonly Project[], linearProjectId: string): Project[] {
  const linked = projects.filter((p) => p.linearProjects.some((l) => l.id === linearProjectId))
  const isMain = (p: Project) => Number(p.linearProjects.some((l) => l.id === linearProjectId && l.primary))
  return linked.sort((a, b) => isMain(b) - isMain(a))
}

/** Names of the Linear projects a repository serves, as shown next to its issues. */
export function projectNames(links: readonly LinearProjectLink[]): string {
  return links.map((l) => l.name).join(', ')
}

/** The links a repository linked through labels gets: every Linear project carrying one of its labels. */
export function linksFromLabels(labels: readonly LinearLabel[], linearProjects: readonly LinearProject[]): LinearProjectLink[] {
  return linearProjects
    .filter((p) => p.labels.some((l) => labels.some((own) => own.id === l.id)))
    .map((p) => ({ id: p.id, name: p.name }))
}

/** Project categories from the ones being worked on to the ones that are over. */
export const PROJECT_STATUS_ORDER = ['started', 'paused', 'planned', 'backlog', 'completed', 'canceled']

/** Categories folded away until the user opens them. */
export const CLOSED_PROJECT_STATUSES = ['completed', 'canceled']

export interface ProjectGroup {
  /** The project category; `none` for projects Linear gives no status. */
  type: string
  projects: LinearProject[]
}

/** Projects split by status category, in workflow order; the order within a group is kept. */
export function groupProjectsByStatus(projects: readonly LinearProject[]): ProjectGroup[] {
  const groups = new Map<string, LinearProject[]>()
  for (const project of projects) {
    const type = project.status?.type ?? 'none'
    groups.set(type, [...(groups.get(type) ?? []), project])
  }
  const rank = (type: string) => {
    const i = PROJECT_STATUS_ORDER.indexOf(type)
    return i === -1 ? PROJECT_STATUS_ORDER.length : i
  }
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b)).map(([type, list]) => ({ type, projects: list }))
}
