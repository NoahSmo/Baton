import { query } from '@anthropic-ai/claude-agent-sdk'
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import type { ConflictCheck, ConflictEdit, ConflictResolution, ResolvedFile } from '../shared/types'
import { resolveInside } from './files'
import { gitStatus } from './git'
import { fetchRemotes, git } from './worktree'

const exec = promisify(execFile)

const SCHEMA = {
  type: 'object',
  properties: {
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: { path: { type: 'string' }, summary: { type: 'string' } },
        required: ['path', 'summary'],
        additionalProperties: false
      }
    }
  },
  required: ['files'],
  additionalProperties: false
}

const prompt = (target: string, files: string[]) => `A merge of ${target} into the current branch stopped on conflicts. The working tree holds the conflict markers (<<<<<<<, =======, >>>>>>>).

Resolve the conflicts in these files, and only these:
${files.map((f) => `- ${f}`).join('\n')}

Rules:
- Read each file, understand what both sides meant to do, and write the version that keeps the intent of both. Pick one side only when the two cannot coexist.
- No conflict marker may remain in a file you resolved.
- Do not touch any other file. Do not run git: staging and committing are handled for you.
- Then answer with one entry per file: its path, and a one or two sentence summary of how you resolved it and why, written for the developer who will review it.`

/** Whether a text still holds the markers git leaves in a conflicted file. */
export function hasMarkers(text: string): boolean {
  return /^<{7}( |$)/m.test(text) && /^>{7}( |$)/m.test(text)
}

/** Files named by `git merge-tree --write-tree --name-only`: after the tree id, up to the first blank line. */
export function parseMergeTree(out: string): string[] {
  const lines = out.split('\n').slice(1)
  const end = lines.indexOf('')
  return (end < 0 ? lines : lines.slice(0, end)).filter(Boolean)
}

/** Files the merge of `target` into HEAD would leave in conflict; none when it goes through, or git cannot tell. */
async function conflictsWith(root: string, target: string): Promise<string[]> {
  try {
    await exec('git', ['merge-tree', '--write-tree', '--name-only', '--no-messages', 'HEAD', target], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
    return []
  } catch (err) {
    const { code, stdout } = err as { code?: number; stdout?: string }
    // Exit 1 is "conflicts"; anything else (old git, unknown ref) is not an answer.
    return code === 1 && stdout ? parseMergeTree(stdout) : []
  }
}

async function refExists(root: string, ref: string): Promise<boolean> {
  return git(root, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`).then(() => true, () => false)
}

/** The remote branch work gets merged into: the remote's default branch, else main or master. */
async function trunkOf(root: string, remote: string): Promise<string | null> {
  const head = await git(root, 'symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`).catch(() => '')
  for (const ref of [head, `${remote}/main`, `${remote}/master`]) {
    if (ref && (await refExists(root, ref))) return ref
  }
  return null
}

/**
 * Asks the remote what it holds now, then looks for a merge that would end in
 * conflicts: the upstream first (a push is refused while it is ahead), then the
 * trunk the branch will be merged into. Nothing in the worktree is touched.
 */
export async function checkConflicts(root: string): Promise<ConflictCheck | null> {
  await fetchRemotes(root)
  const { branch, upstream } = await gitStatus(root)
  if (!branch) return null
  const remote = upstream?.split('/')[0] ?? 'origin'
  const trunk = await trunkOf(root, remote)
  // The branch's own remote twin is the upstream, not a trunk to merge in.
  const targets = [upstream, trunk === `${remote}/${branch}` ? null : trunk]
  for (const target of new Set(targets)) {
    if (!target) continue
    // Already contained: there is nothing to merge.
    if (await git(root, 'merge-base', '--is-ancestor', target, 'HEAD').then(() => true, () => false)) continue
    const files = await conflictsWith(root, target)
    if (files.length) return { target, files }
  }
  return null
}

/** Brings in the commits of the upstream that a push would be refused for; `checkConflicts` found them clean. */
export async function mergeUpstream(root: string): Promise<void> {
  const { upstream, behind } = await gitStatus(root)
  if (!upstream || behind === 0) return
  try {
    await git(root, 'merge', '--no-edit', upstream)
  } catch (err) {
    await git(root, 'merge', '--abort').catch(() => undefined)
    const stderr = (err as { stderr?: string }).stderr?.trim()
    throw stderr ? new Error(stderr) : err
  }
}

/** Files git still holds in conflict. */
async function unmerged(root: string): Promise<string[]> {
  return (await git(root, 'diff', '--name-only', '--diff-filter=U')).split('\n').filter(Boolean)
}

export async function abortMerge(root: string): Promise<void> {
  await git(root, 'merge', '--abort').catch(() => undefined)
}

/**
 * Starts the merge of `target` and has Claude resolve what conflicts. The merge is
 * left open and uncommitted: the user reads the recap, edits what they want, and
 * only `finishMerge` commits. Any failure here puts the worktree back as it was.
 */
export async function resolveConflicts(root: string, target: string, abort: AbortController): Promise<ConflictResolution> {
  if ((await gitStatus(root)).changes.some((c) => c.kind !== 'untracked')) {
    throw new Error('Commit your changes before merging')
  }
  // Only a ref the check named reaches the command line.
  const check = await checkConflicts(root)
  if (!check || check.target !== target) throw new Error('No conflict with ' + target)
  await git(root, 'merge', '--no-commit', '--no-ff', target).catch((err: { stderr?: string }) => {
    // Conflicts make the merge exit 1; it is then open, which is what is wanted.
    if (!/CONFLICT/.test(String((err as { stdout?: string }).stdout ?? err.stderr ?? ''))) throw err
  })
  try {
    const files = await unmerged(root)
    const summaries = await askClaude(root, target, files, abort)
    // Whatever else the agent touched was not asked for.
    const stray = (await git(root, 'diff', '--name-only')).split('\n').filter((p) => p && !files.includes(p))
    if (stray.length) await git(root, 'checkout', '--', ...stray)
    const resolved: ResolvedFile[] = await Promise.all(
      files.map(async (path) => {
        const content = await readFile(await resolveInside(root, path), 'utf8').catch(() => '')
        return { path, content, summary: summaries.get(path) ?? '', resolved: content !== '' && !hasMarkers(content) }
      })
    )
    return { target, files: resolved }
  } catch (err) {
    await abortMerge(root)
    throw err
  }
}

async function askClaude(root: string, target: string, files: string[], abort: AbortController): Promise<Map<string, string>> {
  const tools = ['Read', 'Edit', 'Write', 'Glob', 'Grep']
  const q = query({
    prompt: prompt(target, files),
    options: {
      cwd: root,
      abortController: abort,
      model: 'sonnet',
      tools,
      allowedTools: tools,
      maxTurns: 40,
      persistSession: false,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      // The user's settings carry how they reach Claude; the project's own have no say here.
      settingSources: ['user'],
      outputFormat: { type: 'json_schema', schema: SCHEMA }
    }
  })
  for await (const message of q) {
    if (message.type !== 'result') continue
    if (message.subtype !== 'success') throw new Error(message.subtype)
    const out = (message.structured_output as { files?: { path: string; summary: string }[] } | null)?.files ?? []
    return new Map(out.map((f) => [f.path, f.summary]))
  }
  return new Map()
}

/** Writes the user's last edits, commits the merge, and leaves the push to the caller. */
export async function finishMerge(root: string, edits: ConflictEdit[]): Promise<void> {
  const files = await unmerged(root)
  if (!files.length) throw new Error('No merge to finish')
  const edited = new Map(edits.map((e) => [e.path, e.content]))
  for (const path of files) {
    const target = await resolveInside(root, path)
    const content = edited.get(path) ?? (await readFile(target, 'utf8').catch(() => ''))
    if (hasMarkers(content)) throw new Error(`Conflict markers remain in ${path}`)
    if (edited.has(path)) await writeFile(target, content)
  }
  await git(root, 'add', '--', ...files)
  try {
    await git(root, 'commit', '--no-edit')
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr?.trim()
    throw stderr ? new Error(stderr) : err
  }
}
