import type { LinearIssue, LinearLabel } from '../../shared/types'

/** Open issues of the Linear projects carrying any of `labels`, each issue once. */
export async function issuesOfLabels(labels: readonly LinearLabel[]): Promise<LinearIssue[]> {
  const lists = await Promise.all(labels.map((l) => window.api.linearLabelIssues(l.id)))
  const seen = new Set<string>()
  return lists.flat().filter((issue) => !seen.has(issue.id) && seen.add(issue.id))
}
