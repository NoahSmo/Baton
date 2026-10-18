import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { PullRequestDraft, PullRequestSupport } from '../shared/types'
import { askClaude } from './ask'
import { clip } from './commitMessage'
import { git, gitRaw } from './worktree'

const exec = promisify(execFile)

const SCHEMA = {
  type: 'object',
  properties: { title: { type: 'string' }, body: { type: 'string' } },
  required: ['title', 'body'],
  additionalProperties: false
}

const prompt = (base: string, commits: string, stat: string, diff: string) => `Write the pull request for the branch checked out here, to be merged into ${base}.

Rules:
- A title of 70 characters or fewer, imperative, no trailing period.
- A body in Markdown: a short summary, then a bullet list of the notable changes. No long paragraphs.
- Write in the language of the commit subjects.
- Do not modify anything. Read files if the diff is not enough.

Commits of the branch:
${commits || '(none)'}

Files changed:
${stat || '(none)'}

Diff:
${diff || '(no diff)'}`

/** Keeps what of an agent's answer can open a pull request. */
export function parseDraft(output: unknown, base: string): PullRequestDraft {
  const { title, body } = (output ?? {}) as { title?: unknown; body?: unknown }
  const clean = (text: unknown) =>
    typeof text === 'string' ? text.replace(/^```\w*\n/, '').replace(/\n```\s*$/, '').trim() : ''
  return { title: clean(title).split('\n')[0], body: clean(body), base }
}

/** The error text of a failed command, which is where `gh` and git explain themselves. */
function explain(err: unknown): Error {
  const stderr = (err as { stderr?: string }).stderr?.trim()
  return stderr ? new Error(stderr) : err instanceof Error ? err : new Error(String(err))
}

export async function pullRequestSupport(): Promise<PullRequestSupport> {
  try {
    await exec('gh', ['--version'])
  } catch {
    return { ok: false, reason: 'missing' }
  }
  try {
    await exec('gh', ['auth', 'status'])
  } catch {
    return { ok: false, reason: 'signed-out' }
  }
  return { ok: true }
}

/** Branch a pull request targets: the remote's default branch, a usual trunk otherwise. */
export async function baseBranch(root: string): Promise<string> {
  const head = await git(root, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD').catch(() => '')
  if (head.startsWith('origin/')) return head.slice(7)
  for (const name of ['main', 'master', 'dev', 'develop']) {
    if (await git(root, 'show-ref', '--verify', '--quiet', `refs/remotes/origin/${name}`).then(() => true, () => false)) return name
  }
  return 'main'
}

/** Has Claude read the branch and word its pull request. */
export async function draftPullRequest(root: string, abort: AbortController): Promise<PullRequestDraft> {
  const base = await baseBranch(root)
  const range = `origin/${base}..HEAD`
  const [commits, stat, diff] = await Promise.all([
    git(root, 'log', '--format=- %s', range).catch(() => ''),
    git(root, 'diff', '--stat', `origin/${base}...HEAD`).catch(() => ''),
    gitRaw(root, 'diff', `origin/${base}...HEAD`).catch(() => '')
  ])
  const answer = await askClaude(root, prompt(base, commits, stat, clip(diff)), SCHEMA, abort)
  return parseDraft(answer, base)
}

/** Opens the pull request of the checked out branch, which must be pushed already. Resolves with its URL. */
export async function createPullRequest(root: string, branch: string, draft: PullRequestDraft): Promise<string> {
  if (!draft.title.trim()) throw new Error('A pull request needs a title')
  try {
    const { stdout } = await exec(
      'gh',
      ['pr', 'create', '--base', draft.base, '--head', branch, '--title', draft.title.trim(), '--body', draft.body],
      { cwd: root, timeout: 60_000 }
    )
    const url = stdout.match(/https?:\/\/\S+/g)?.pop()
    if (!url) throw new Error(stdout.trim() || 'gh did not say where the pull request is')
    return url
  } catch (err) {
    // gh refuses a second pull request for a branch, but says where the first one is.
    const existing = ((err as { stderr?: string }).stderr ?? '').match(/https?:\/\/\S+\/pull\/\d+/)?.[0]
    if (existing) return existing
    throw explain(err)
  }
}
