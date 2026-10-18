import { query } from '@anthropic-ai/claude-agent-sdk'
import { gitStatus } from './git'
import { git, gitRaw } from './worktree'

/** A diff past this is cut: the start of it says what the commit is about. */
const MAX_DIFF_CHARS = 30_000

const SCHEMA = {
  type: 'object',
  properties: { message: { type: 'string' } },
  required: ['message'],
  additionalProperties: false
}

const prompt = (files: string, diff: string, recent: string) => `Write the git commit message for the changes below.

Rules:
- A short subject line (imperative, 50 characters or fewer, no trailing period), then a blank line, then a brief bullet list of what was done.
- No long explanatory paragraphs. Skip the bullets when the subject says it all.
- Write in the language of the recent commit subjects. Follow their conventions (prefixes, casing) if they have any.
- No trailer such as Co-Authored-By.
- Do not modify anything. Untracked files are not in the diff: read them if you need to.

Files in the commit:
${files}

Recent commit subjects:
${recent || '(none)'}

Diff:
${diff || '(no diff of tracked files)'}`

/** Keeps what of an agent's answer can be used as a commit message. */
export function parseMessage(output: unknown): string {
  const message = (output as { message?: unknown } | null)?.message
  if (typeof message !== 'string') return ''
  // Models like to fence what they hand over.
  return message.replace(/^```\w*\n/, '').replace(/\n```\s*$/, '').trim()
}

/** Cuts a diff to what is worth reading, saying so when something was left out. */
export function clip(diff: string): string {
  return diff.length > MAX_DIFF_CHARS ? `${diff.slice(0, MAX_DIFF_CHARS)}\n… (diff cut)` : diff
}

/**
 * Has Claude read the given changes and word their commit. The agent only gets
 * tools that read, and nothing it proposes is committed by itself.
 */
export async function draftCommitMessage(root: string, paths: string[], abort: AbortController): Promise<string> {
  // Only paths git itself reports reach the command line.
  const known = new Map((await gitStatus(root)).changes.map((c) => [c.path, c]))
  const chosen = paths.flatMap((p) => {
    const change = known.get(p)
    return change ? [change] : []
  })
  if (!chosen.length) throw new Error('Nothing to commit')
  const tracked = chosen.filter((c) => c.kind !== 'untracked').flatMap((c) => [c.path, ...(c.from ? [c.from] : [])])

  const [diff, recent] = await Promise.all([
    // A repository without a commit has no HEAD to diff against.
    tracked.length ? gitRaw(root, 'diff', 'HEAD', '--', ...tracked).catch(() => '') : '',
    git(root, 'log', '-n', '10', '--format=%s').catch(() => '')
  ])
  const files = chosen.map((c) => `${c.kind}: ${c.path}`).join('\n')

  const readOnly = ['Read', 'Glob', 'Grep']
  const q = query({
    prompt: prompt(files, clip(diff), recent),
    options: {
      cwd: root,
      abortController: abort,
      // Wording a diff needs no large model.
      model: 'haiku',
      tools: readOnly,
      allowedTools: readOnly,
      maxTurns: 10,
      persistSession: false,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      // The user's settings carry how they reach Claude; the project's own have no say here.
      settingSources: ['user'],
      outputFormat: { type: 'json_schema', schema: SCHEMA }
    }
  })
  for await (const message of q) {
    if (message.type !== 'result') continue
    if (message.subtype === 'success') return parseMessage(message.structured_output)
    throw new Error(message.subtype)
  }
  return ''
}
