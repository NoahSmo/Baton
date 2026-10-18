import type { HandoffDraft, StoredEvent } from '../shared/types'
import { askClaude } from './ask'

const SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' } },
  required: ['summary'],
  additionalProperties: false
}

/** Past this, the oldest part of the conversation is left out: the end says where the work stands. */
const MAX_TRANSCRIPT_CHARS = 40_000

/** The conversation as plain text, without tool noise, cut to its most recent part. */
export function conversationText(events: StoredEvent[]): string {
  const lines: string[] = []
  for (const { event } of events) {
    if (event.kind === 'user') lines.push(`User: ${event.text}`)
    else if (event.kind === 'assistant_text') lines.push(`Agent: ${event.text}`)
    else if (event.kind === 'tool_use') lines.push(`(agent used ${event.name})`)
  }
  const text = lines.join('\n\n')
  return text.length > MAX_TRANSCRIPT_CHARS ? `… (earlier part left out)\n${text.slice(-MAX_TRANSCRIPT_CHARS)}` : text
}

const prompt = (conversation: string) => `Below is the conversation between a developer and a coding agent working in this folder. Another agent will take over the work, knowing nothing of it.

Write the brief it needs, in the language of the conversation:
- The goal, in a sentence or two.
- What is done, and what is left, as short bullet lists.
- Decisions made and constraints to respect.
- Files and branches that matter. Check the state of the folder with your tools if the conversation is unclear.
Address the new agent directly. Do not modify anything. Stay under 400 words.

Conversation:
${conversation}`

export function parseSummary(output: unknown): string {
  const summary = (output as { summary?: unknown } | null)?.summary
  return typeof summary === 'string' ? summary.replace(/^```\w*\n/, '').replace(/\n```\s*$/, '').trim() : ''
}

/** Has Claude sum up the work of an agent so a new one can carry on. */
export async function draftHandoff(root: string, title: string, events: StoredEvent[], abort: AbortController): Promise<HandoffDraft> {
  const answer = await askClaude(root, prompt(conversationText(events)), SCHEMA, abort)
  return { title, summary: parseSummary(answer) }
}
