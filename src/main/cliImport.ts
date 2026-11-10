import type { SessionMessage } from '@anthropic-ai/claude-agent-sdk'
import type { UiEvent } from '../shared/types'

/** Text of a tool result, which the API gives as a string or as blocks. */
function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((b) => (b && typeof b === 'object' && (b as { type?: string }).type === 'text' ? String((b as { text?: string }).text ?? '') : ''))
    .filter(Boolean)
    .join('\n')
}

/**
 * Turns what the Claude Code CLI wrote to a session into transcript events, so a
 * conversation continued there shows up in the app. Thinking and system lines are left out.
 */
export function sessionEvents(messages: SessionMessage[]): UiEvent[] {
  const events: UiEvent[] = []
  for (const m of messages) {
    // Subagent work is summarized by the tool result that started it.
    if (m.parent_tool_use_id || m.parent_agent_id) continue
    const content = (m.message as { content?: unknown } | null)?.content
    const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : []
    for (const b of blocks as Array<Record<string, unknown>>) {
      if (m.type === 'user') {
        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) events.push({ kind: 'user', text: b.text })
        else if (b.type === 'tool_result') {
          events.push({ kind: 'tool_result', toolUseId: String(b.tool_use_id ?? ''), content: resultText(b.content), isError: b.is_error === true })
        }
      } else if (m.type === 'assistant') {
        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) events.push({ kind: 'assistant_text', text: b.text })
        else if (b.type === 'tool_use') {
          events.push({ kind: 'tool_use', toolUseId: String(b.id ?? ''), name: String(b.name ?? ''), input: (b.input as Record<string, unknown>) ?? {} })
        }
      }
    }
  }
  return events
}
