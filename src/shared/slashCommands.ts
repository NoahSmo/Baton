import { AGENT_MODELS, type AgentModel } from './types'

/** A Claude Code command, as offered when the message starts with "/". */
export interface SlashCommandInfo {
  name: string
  description: string
  argumentHint?: string
}

/**
 * Commands of Claude Code that work in a conversation driven from here. Shown
 * until the session reports its own list, which adds the user's skills and commands.
 */
export const BUILTIN_COMMANDS: SlashCommandInfo[] = [
  { name: 'compact', description: 'Summarize the conversation to free up context', argumentHint: '[instructions]' },
  { name: 'model', description: 'Switch the model of this agent', argumentHint: '<model>' },
  { name: 'context', description: 'Show how the context window is used' },
  { name: 'cost', description: 'Show the cost and usage of this session' },
  { name: 'init', description: 'Create a CLAUDE.md for this project' },
  { name: 'review', description: 'Review a pull request' },
  { name: 'security-review', description: 'Review the pending changes for security issues' }
]

/** "/compact focus on the API" → { name: "compact", args: "focus on the API" }; null for text that is not a command. */
export function parseSlashCommand(text: string): { name: string; args: string } | null {
  const m = /^\/([A-Za-z][\w:.-]*)(?:\s+([\s\S]*))?$/.exec(text.trim())
  return m ? { name: m[1], args: (m[2] ?? '').trim() } : null
}

/** The command being typed, while the text is still its name: "/co" → "co". Null once arguments begin. */
export function commandQuery(draft: string): string | null {
  const m = /^\/([\w:.-]*)$/.exec(draft)
  return m ? m[1] : null
}

/** Commands whose name starts with the query, then those merely containing it; names are unique. */
export function matchCommands(commands: SlashCommandInfo[], query: string): SlashCommandInfo[] {
  const q = query.toLowerCase()
  const seen = new Set<string>()
  const unique = commands.filter((c) => !seen.has(c.name) && seen.add(c.name))
  return [
    ...unique.filter((c) => c.name.toLowerCase().startsWith(q)),
    ...unique.filter((c) => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q))
  ]
}

/** Commands of the session first, then the built-in ones it did not list. */
export function mergeCommands(session: SlashCommandInfo[] | null): SlashCommandInfo[] {
  if (!session?.length) return BUILTIN_COMMANDS
  const known = new Set(session.map((c) => c.name))
  return [...session, ...BUILTIN_COMMANDS.filter((c) => !known.has(c.name))]
}

const MODEL_WORDS: Record<string, AgentModel> = {
  'fable': 'claude-fable-5-2',
  'opus-5.5': 'claude-opus-5-5',
  'sonnet-5.5': 'claude-sonnet-5-5',
  'haiku-5.5': 'claude-haiku-5-5',
  'fable-5.1': 'claude-fable-5-1',
  'fable-5.2': 'claude-fable-5-2'
}

/** The model a "/model <name>" asks for; null when the name is not one this app can set. */
export function modelFromArgument(arg: string): AgentModel | null {
  const word = arg.trim().toLowerCase()
  if (!word) return null
  return AGENT_MODELS.find((m) => m === word) ?? MODEL_WORDS[word] ?? null
}
