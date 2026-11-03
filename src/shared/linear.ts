import type { LinearIssue, LinearLabel, Project } from './types'

/** First message sent to the agent for a feature created from an issue. */
export function issuePrompt(issue: LinearIssue): string {
  return [`${issue.identifier}: ${issue.title}`, issue.description?.trim(), `Linear issue: ${issue.url}`]
    .filter(Boolean)
    .join('\n\n')
}

/** Repositories whose labels include one of `labelIds`: several repositories can serve the same Linear project. */
export function reposForLabels(projects: Project[], labelIds: readonly string[]): Project[] {
  return projects.filter((p) => p.linearLabels.some((l) => labelIds.includes(l.id)))
}

/** Names of a repository's labels, as shown next to its issues. */
export function labelNames(labels: readonly LinearLabel[]): string {
  return labels.map((l) => l.name).join(', ')
}
