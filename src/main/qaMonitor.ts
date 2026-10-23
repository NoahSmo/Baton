import { randomUUID } from 'node:crypto'
import type { Lang } from '../shared/i18n'
import type { Feature, QaRun } from '../shared/types'
import { recapRun, runTests, type TestResult } from './qa'
import type { Store } from './store'

/** Runs kept per project; older ones make way. */
const KEEP_RUNS = 50

export interface QaRunner {
  runTests(cwd: string, command: string, abort: AbortSignal): Promise<TestResult>
  recap(cwd: string, lang: Lang, feature: string, command: string, result: TestResult, abort: AbortController): Promise<string>
}

const claudeRunner: QaRunner = { runTests, recap: recapRun }

/**
 * Tests the features of projects that asked for it: once an agent is done, its
 * tests run in its worktree and Claude sums the result up for the QA panel.
 */
export class QaMonitor {
  private running = new Map<string, AbortController>()

  constructor(
    private readonly store: Store,
    private readonly lang: () => Lang,
    private readonly publish: (run: QaRun) => void,
    private readonly runner: QaRunner = claudeRunner
  ) {}

  /** An agent finished a turn: the project's tests run if it asked for them. */
  featureDone(feature: Feature): Promise<void> {
    const qa = this.store.getProject(feature.projectId)?.qa
    if (!qa?.enabled || !qa.command) return Promise.resolve()
    return this.start(feature, qa.command)
  }

  /** Runs the tests now, even for a project that does not run them by itself. */
  runNow(featureId: string): Promise<void> {
    const feature = this.store.getFeature(featureId)
    if (!feature) return Promise.reject(new Error('Unknown feature'))
    const command = this.store.getProject(feature.projectId)?.qa.command
    if (!command) return Promise.reject(new Error('No test command'))
    return this.start(feature, command)
  }

  shutdown(): void {
    for (const abort of this.running.values()) abort.abort()
  }

  private save(run: QaRun): void {
    this.store.saveQaRun(run)
    this.publish(run)
  }

  private async start(feature: Feature, command: string): Promise<void> {
    // Two runs of one worktree would trample each other's files: the newer replaces the older.
    this.running.get(feature.id)?.abort()
    const abort = new AbortController()
    this.running.set(feature.id, abort)

    let run: QaRun = {
      id: randomUUID(),
      featureId: feature.id,
      projectId: feature.projectId,
      featureTitle: feature.title,
      command,
      status: 'running',
      exitCode: null,
      output: '',
      recap: '',
      startedAt: Date.now(),
      endedAt: null
    }
    this.save(run)

    let result: TestResult
    try {
      result = await this.runner.runTests(feature.worktreePath, command, abort.signal)
    } catch (err) {
      run = { ...run, status: 'error', output: err instanceof Error ? err.message : String(err), endedAt: Date.now() }
      this.save(run)
      this.release(feature.id, abort)
      return
    }
    // A run that was replaced or cut short says nothing about the code.
    const status = abort.signal.aborted || result.timedOut || result.exitCode === null ? 'error' : result.exitCode === 0 ? 'passed' : 'failed'
    run = { ...run, status, exitCode: result.exitCode, output: result.output, endedAt: Date.now() }
    this.save(run)
    this.store.pruneQaRuns(feature.projectId, KEEP_RUNS)

    if (!abort.signal.aborted) {
      try {
        const recap = await this.runner.recap(feature.worktreePath, this.lang(), feature.title, command, result, abort)
        if (recap) this.save({ ...run, recap })
      } catch {
        // The output is there to read; the recap is a bonus.
      }
    }
    this.release(feature.id, abort)
  }

  private release(featureId: string, abort: AbortController): void {
    if (this.running.get(featureId) === abort) this.running.delete(featureId)
  }
}
