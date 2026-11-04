import type { LinearIssue, LinearProjectLink } from '../../shared/types'

/** Open issues of the Linear projects a repository serves, each issue once. */
export async function issuesOfProjects(links: readonly LinearProjectLink[]): Promise<LinearIssue[]> {
  const lists = await Promise.all(links.map((l) => window.api.linearIssues(l.id)))
  const seen = new Set<string>()
  return lists.flat().filter((issue) => !seen.has(issue.id) && seen.add(issue.id))
}
