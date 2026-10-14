import { query } from '@anthropic-ai/claude-agent-sdk'
import type { Lang } from '../shared/i18n'
import type { LaunchSuggestion } from '../shared/types'

const MAX_SUGGESTIONS = 8

const SCHEMA = {
  type: 'object',
  properties: {
    commands: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, command: { type: 'string' } },
        required: ['name', 'command'],
        additionalProperties: false
      }
    }
  },
  required: ['commands'],
  additionalProperties: false
}

const prompt = (lang: Lang) => `Find the shell commands a developer of this project runs day to day: start the app or its dev server, run the tests, build, lint.

Read what the project says about itself: manifests (package.json, Makefile, Cargo.toml, Package.swift, pyproject.toml, go.mod…), scripts, docker-compose files, the README. Do not modify anything.

Rules:
- Only commands these files back up; an empty list when nothing does.
- Each one is a single line, run from the root of the project in the user's login shell.
- Nothing that deploys, publishes, deletes, or touches anything outside the machine.
- At most ${MAX_SUGGESTIONS}, the most useful first.
- Names are one to three words, in ${lang === 'fr' ? 'French' : 'English'}.`

/** Keeps what of an agent's answer can be shown as launch commands. */
export function parseSuggestions(output: unknown): LaunchSuggestion[] {
  const list = (output as { commands?: unknown } | null)?.commands
  if (!Array.isArray(list)) return []
  return list
    .flatMap((item): LaunchSuggestion[] => {
      const { name, command } = (item ?? {}) as Record<string, unknown>
      if (typeof command !== 'string' || !command.trim()) return []
      // A terminal runs each line it is given: a command is shown, and run, as one.
      const line = command.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' && ')
      return [{ name: typeof name === 'string' ? name.trim() : '', command: line }]
    })
    .slice(0, MAX_SUGGESTIONS)
}

/**
 * Has Claude read a project and say which commands it is launched with. The
 * agent only gets tools that read, and nothing it proposes runs by itself.
 */
export async function suggestCommands(cwd: string, lang: Lang, abort: AbortController): Promise<LaunchSuggestion[]> {
  const readOnly = ['Read', 'Glob', 'Grep']
  const q = query({
    prompt: prompt(lang),
    options: {
      cwd,
      abortController: abort,
      // Reading a few manifests needs no large model.
      model: 'haiku',
      tools: readOnly,
      allowedTools: readOnly,
      maxTurns: 30,
      persistSession: false,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      // The user's settings carry how they reach Claude; the project's own have no say here.
      settingSources: ['user'],
      outputFormat: { type: 'json_schema', schema: SCHEMA }
    }
  })
  for await (const message of q) {
    if (message.type !== 'result') continue
    if (message.subtype === 'success') return parseSuggestions(message.structured_output)
    throw new Error(message.subtype)
  }
  return []
}
