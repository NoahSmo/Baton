import { describe, expect, it, vi } from 'vitest'
import { parseRecap, runTests, tail } from '../src/main/qa'
import { QaMonitor, type QaRunner } from '../src/main/qaMonitor'
import { Store } from '../src/main/store'
import type { Feature, QaRun } from '../src/shared/types'

describe('qa output', () => {
  it('keeps the end of a long output', () => {
    expect(tail('abcdef', 3)).toBe('… (output cut)\ndef')
    expect(tail('abc', 3)).toBe('abc')
  })

  it('reads a recap from the agent answer', () => {
    expect(parseRecap({ recap: '  All good  ' })).toBe('All good')
    expect(parseRecap(null)).toBe('')
    expect(parseRecap({ recap: 3 })).toBe('')
  })
})

describe('runTests', () => {
  it('reports exit code and output', async () => {
    const ok = await runTests(process.cwd(), 'echo hi', new AbortController().signal)
    expect(ok).toMatchObject({ exitCode: 0, timedOut: false })
    expect(ok.output).toContain('hi')
    const ko = await runTests(process.cwd(), 'echo boom >&2; exit 3', new AbortController().signal)
    expect(ko.exitCode).toBe(3)
    expect(ko.output).toContain('boom')
  })

  it('stops a run that takes too long', async () => {
    const res = await runTests(process.cwd(), 'sleep 5', new AbortController().signal, 100)
    expect(res.timedOut).toBe(true)
  })
})

function setup(runner: QaRunner, qa = { enabled: true, command: 'npm test' }) {
  const store = new Store(':memory:')
  store.insertProject({ id: 'p', name: 'P', path: '/p', color: '#fff', linearLabel: null, commands: [], templates: [], worktrees: true, qa })
  store.updateProject({ ...store.getProject('p')!, qa })
  const feature = { id: 'f', projectId: 'p', title: 'Login', worktreePath: '/wt' } as Feature
  const published: QaRun[] = []
  const monitor = new QaMonitor(store, () => 'en', (r) => published.push(r), runner)
  return { store, feature, published, monitor }
}

describe('QaMonitor', () => {
  it('runs the tests of a finished feature and records the recap', async () => {
    const runner: QaRunner = {
      runTests: vi.fn(async () => ({ exitCode: 0, output: '3 passed', timedOut: false })),
      recap: vi.fn(async () => 'All 3 tests pass.')
    }
    const { store, feature, published, monitor } = setup(runner)
    await monitor.featureDone(feature)
    expect(runner.runTests).toHaveBeenCalledWith('/wt', 'npm test', expect.anything())
    expect(published.map((r) => r.status)).toEqual(['running', 'passed', 'passed'])
    expect(store.listQaRuns()[0]).toMatchObject({ status: 'passed', recap: 'All 3 tests pass.', featureTitle: 'Login' })
  })

  it('marks a failing run and survives a recap that fails', async () => {
    const runner: QaRunner = {
      runTests: async () => ({ exitCode: 1, output: 'FAIL', timedOut: false }),
      recap: async () => {
        throw new Error('offline')
      }
    }
    const { store, feature, monitor } = setup(runner)
    await monitor.featureDone(feature)
    expect(store.listQaRuns()[0]).toMatchObject({ status: 'failed', exitCode: 1, recap: '' })
  })

  it('does nothing when the project did not ask for tests', async () => {
    const runner: QaRunner = { runTests: vi.fn(), recap: vi.fn() }
    const { feature, monitor } = setup(runner, { enabled: false, command: 'npm test' })
    await monitor.featureDone(feature)
    expect(runner.runTests).not.toHaveBeenCalled()
  })

  it('counts a timeout as not completed', async () => {
    const runner: QaRunner = { runTests: async () => ({ exitCode: null, output: '', timedOut: true }), recap: async () => '' }
    const { store, feature, monitor } = setup(runner)
    await monitor.featureDone(feature)
    expect(store.listQaRuns()[0].status).toBe('error')
  })
})
