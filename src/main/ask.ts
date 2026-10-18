import { query } from '@anthropic-ai/claude-agent-sdk'

/**
 * Asks Claude a question about the files of a folder and returns the structured answer.
 * The agent only gets tools that read: nothing it says is acted on by itself.
 */
export async function askClaude(cwd: string, prompt: string, schema: Record<string, unknown>, abort: AbortController): Promise<unknown> {
  const readOnly = ['Read', 'Glob', 'Grep']
  const q = query({
    prompt,
    options: {
      cwd,
      abortController: abort,
      // Wording a diff or a conversation needs no large model.
      model: 'haiku',
      tools: readOnly,
      allowedTools: readOnly,
      maxTurns: 10,
      persistSession: false,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      // The user's settings carry how they reach Claude; the project's own have no say here.
      settingSources: ['user'],
      outputFormat: { type: 'json_schema', schema }
    }
  })
  for await (const message of q) {
    if (message.type !== 'result') continue
    if (message.subtype === 'success') return message.structured_output
    throw new Error(message.subtype)
  }
  return null
}
