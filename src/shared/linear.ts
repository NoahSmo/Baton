import type { LinearIssue } from './types'

/** First message sent to the agent for a feature created from an issue. */
export function issuePrompt(issue: LinearIssue): string {
  return [`${issue.identifier}: ${issue.title}`, issue.description?.trim(), `Linear issue: ${issue.url}`]
    .filter(Boolean)
    .join('\n\n')
}
