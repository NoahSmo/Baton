import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { Lang } from '../shared/i18n'

/** Output past this is cut from its start: a failure is reported last. */
const MAX_OUTPUT_CHARS = 20_000

/** A suite that hangs must not run forever. */
export const QA_TIMEOUT_MS = 10 * 60 * 1000

export interface TestResult {
  exitCode: number | null
  output: string
  timedOut: boolean
}

/** Keeps the end of an output, saying so when the start was left out. */
export function tail(output: string, max = MAX_OUTPUT_CHARS): string {
  return output.length > max ? `… (output cut)\n${output.slice(-max)}` : output
}

/** The app's environment, minus what `npm run dev` adds to it: version managers choke on those. */
function cleanEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('npm_')))
}

/**
 * Runs a project's test command in a worktree, through the user's login shell so
 * its PATH and version managers apply as in their terminal.
 */
export function runTests(cwd: string, command: string, abort: AbortSignal, timeoutMs = QA_TIMEOUT_MS): Promise<TestResult> {
  return new Promise((resolve, reject) => {
    if (!existsSync(cwd)) return reject(new Error(`Folder not found: ${cwd}`))
    const shell = process.env.SHELL || '/bin/sh'
    const child = spawn(shell, ['-l', '-c', command], { cwd, env: { ...cleanEnv(), CI: '1', FORCE_COLOR: '0' } })
    let output = ''
    let timedOut = false
    const collect = (chunk: Buffer) => {
      // Never hold more than a cut output needs.
      output = (output + chunk.toString()).slice(-MAX_OUTPUT_CHARS * 2)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const stop = () => child.kill('SIGTERM')
    const timer = setTimeout(() => {
      timedOut = true
      stop()
    }, timeoutMs)
    abort.addEventListener('abort', stop, { once: true })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      abort.removeEventListener('abort', stop)
      resolve({ exitCode: code, output: tail(output), timedOut })
    })
  })
}

const SCHEMA = {
  type: 'object',
  properties: { recap: { type: 'string' } },
  required: ['recap'],
  additionalProperties: false
}

const prompt = (lang: Lang, feature: string, command: string, result: TestResult) => `Recap this automatic test run of the feature "${feature}" for the developer who started it.

Command: ${command}
${result.timedOut ? 'The run was stopped: it took too long.' : `Exit code: ${result.exitCode}`}

Rules:
- Two to five short lines, in ${lang === 'fr' ? 'French' : 'English'}, no heading.
- First line: did it pass, and how many tests ran when the output says.
- On failure: name each failing test and the likely cause, from the output only. Do not guess beyond it.
- Do not modify anything.

Output:
${result.output || '(no output)'}`

/** Keeps what of an agent's answer can be shown as a recap. */
export function parseRecap(output: unknown): string {
  const recap = (output as { recap?: unknown } | null)?.recap
  return typeof recap === 'string' ? recap.trim() : ''
}

/**
 * Has Claude read a test run's output and sum it up. It gets no tool at all:
 * everything it needs is in the prompt, and nothing it says is acted upon.
 */
export async function recapRun(cwd: string, lang: Lang, feature: string, command: string, result: TestResult, abort: AbortController): Promise<string> {
  const q = query({
    prompt: prompt(lang, feature, command, result),
    options: {
      cwd,
      abortController: abort,
      // Reading a log needs no large model.
      model: 'haiku',
      tools: [],
      maxTurns: 2,
      persistSession: false,
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      // The user's settings carry how they reach Claude; the project's own have no say here.
      settingSources: ['user'],
      outputFormat: { type: 'json_schema', schema: SCHEMA }
    }
  })
  for await (const message of q) {
    if (message.type !== 'result') continue
    if (message.subtype === 'success') return parseRecap(message.structured_output)
    throw new Error(message.subtype)
  }
  return ''
}
