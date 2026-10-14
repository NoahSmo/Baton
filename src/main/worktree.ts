import { execFile } from 'node:child_process'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)

/** Output untouched: `git` trims it, which would cost a file its last line break. */
export async function gitRaw(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 })
  return stdout
}

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec('git', args, { cwd })
  return stdout.trim()
}

/** Asks the remotes what they hold now. Offline or signed out, what was last known stands. */
export async function fetchRemotes(repo: string): Promise<void> {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  await exec('git', ['fetch', '--all', '--prune', '--quiet'], { cwd: repo, env, timeout: 60_000 }).catch(() => undefined)
}

export async function isGitRepo(path: string): Promise<boolean> {
  try {
    return (await git(path, 'rev-parse', '--is-inside-work-tree')) === 'true'
  } catch {
    return false
  }
}

async function branchExists(repo: string, branch: string): Promise<boolean> {
  try {
    await git(repo, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`)
    return true
  } catch {
    return false
  }
}

/** Untracked env files never reach a fresh worktree, yet most projects need them to run. */
async function copyEnvFiles(repo: string, worktree: string): Promise<void> {
  const entries = await readdir(repo, { withFileTypes: true })
  for (const e of entries) {
    if (e.isFile() && e.name.startsWith('.env') && !existsSync(join(worktree, e.name))) {
      await copyFile(join(repo, e.name), join(worktree, e.name))
    }
  }
}

export interface RepoState {
  isGit: boolean
  branch: string | null
  changedFiles: number
}

export async function repoState(path: string): Promise<RepoState> {
  if (!(await isGitRepo(path))) return { isGit: false, branch: null, changedFiles: 0 }
  const [branch, status] = await Promise.all([
    git(path, 'branch', '--show-current').catch(() => ''),
    git(path, 'status', '--porcelain').catch(() => '')
  ])
  return { isGit: true, branch: branch || null, changedFiles: status ? status.split('\n').length : 0 }
}

export interface Worktree {
  branch: string
  path: string
}

/**
 * Creates a worktree on a new branch cut from the repo's current HEAD.
 * The branch is `preferredBranch` when given, `feat/<slug>` otherwise; branch
 * and directory names are suffixed when already taken.
 */
export async function createWorktree(
  repo: string,
  worktreesRoot: string,
  slug: string,
  preferredBranch?: string
): Promise<Worktree> {
  await mkdir(worktreesRoot, { recursive: true })
  const base = preferredBranch ?? `feat/${slug}`
  let branch = base
  let name = slug
  for (let i = 2; (await branchExists(repo, branch)) || existsSync(join(worktreesRoot, name)); i++) {
    branch = `${base}-${i}`
    name = `${slug}-${i}`
  }
  const path = join(worktreesRoot, name)
  await git(repo, 'worktree', 'add', '-b', branch, path)
  await copyEnvFiles(repo, path)
  return { branch, path }
}

/** Removes the worktree directory, uncommitted changes included. The branch is kept. */
export async function removeWorktree(repo: string, path: string): Promise<void> {
  if (existsSync(path)) await git(repo, 'worktree', 'remove', '--force', path)
  await git(repo, 'worktree', 'prune')
}
