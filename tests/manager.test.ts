import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentOptions } from '../src/main/agent'

/** What each fake agent was sent, in order. */
const sent: { featureId: string; text: string; compactFirst: boolean }[] = []
const agents = new Map<string, AgentOptions>()

vi.mock('../src/main/agent', () => ({
  AgentSession: class {
    constructor(private readonly opts: AgentOptions) {
      agents.set(opts.cwd, opts)
    }
    send(text: string, _images: unknown[], compactFirst = false) {
      sent.push({ featureId: this.opts.cwd, text, compactFirst })
    }
    setModel = vi.fn()
    get hasPendingRequests() {
      return false
    }
  }
}))

import { Manager, type ManagerSink } from '../src/main/manager'
import { Store } from '../src/main/store'
import { DICTS } from '../src/shared/i18n'
import type { Feature, UsageWarning } from '../src/shared/types'

const HOUR = 60 * 60 * 1000

function setup(maxRunning = 1) {
  const dir = mkdtempSync(join(tmpdir(), 'baton-manager-'))
  const store = new Store(':memory:')
  store.insertProject({ id: 'p', name: 'P', path: dir, color: '#fff', linearLabel: null, commands: [] })
  const warnings: UsageWarning[] = []
  const sink: ManagerSink = {
    event: () => {},
    feature: () => {},
    featureRemoved: () => {},
    projectRemoved: () => {},
    stream: () => {},
    attention: () => {},
    usageWarning: (w) => warnings.push(w)
  }
  let max = maxRunning
  const manager = new Manager(store, join(dir, 'wt'), join(dir, 'att'), {} as never, () => DICTS.en, () => max, sink)
  const add = (id: string, over: Partial<Feature> = {}) =>
    store.insertFeature({
      id,
      projectId: 'p',
      title: id,
      linear: null,
      branch: id,
      // The fake agent is keyed by it.
      worktreePath: id,
      status: 'idle',
      permissionMode: 'default',
      agentModel: 'sonnet',
      sessionId: null,
      model: null,
      costUsd: 0,
      contextTokens: 0,
      limitResetsAt: null,
      createdAt: 0,
      updatedAt: 0,
      ...over
    })
  /** Plays the end of a turn as the agent would report it. */
  const finish = (id: string) =>
    agents.get(id)!.emit({
      type: 'event',
      event: { kind: 'result', isError: false, interrupted: false, text: '', turnCostUsd: 0 }
    })
  return { store, manager, add, finish, warnings, setMax: (n: number) => (max = n) }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  sent.length = 0
  agents.clear()
})

describe('agent slots', () => {
  it('queues an agent while the slots are taken, and starts it when one frees up', async () => {
    const { store, manager, add, finish } = setup(1)
    add('a')
    add('b')
    manager.send('a', 'go a')
    manager.send('b', 'go b')
    expect(sent.map((s) => s.featureId)).toEqual(['a'])
    expect(store.getFeature('b')!.status).toBe('queued')

    finish('a')
    await flush()
    expect(sent.map((s) => s.featureId)).toEqual(['a', 'b'])
    expect(store.getFeature('b')!.status).toBe('working')
  })

  it('lets a running agent take more messages without a slot of its own', () => {
    const { manager, add } = setup(1)
    add('a')
    manager.send('a', 'one')
    manager.send('a', 'two')
    expect(sent.map((s) => s.text)).toEqual(['one', 'two'])
  })

  it('keeps every message of a queued agent, in order', async () => {
    const { manager, add, finish } = setup(1)
    add('a')
    add('b')
    manager.send('a', 'go')
    manager.send('b', 'one')
    manager.send('b', 'two')
    finish('a')
    await flush()
    expect(sent.filter((s) => s.featureId === 'b').map((s) => s.text)).toEqual(['one', 'two'])
  })

  it('drops the messages of a queued agent that is stopped', () => {
    const { store, manager, add } = setup(1)
    add('a')
    add('b')
    manager.send('a', 'go')
    manager.send('b', 'go')
    void manager.interrupt('b')
    expect(store.getFeature('b')!.status).toBe('idle')
  })

  it('starts queued agents when the limit is raised', () => {
    const { manager, add, setMax } = setup(1)
    add('a')
    add('b')
    manager.send('a', 'go')
    manager.send('b', 'go')
    setMax(0)
    manager.startQueued()
    expect(sent.map((s) => s.featureId)).toEqual(['a', 'b'])
  })

  it('holds the queue while the usage limit refuses requests', async () => {
    const { manager, add, finish } = setup(1)
    add('a')
    add('b')
    manager.send('a', 'go')
    manager.send('b', 'go')
    agents.get('a')!.emit({
      type: 'event',
      event: { kind: 'rate_limit', status: 'rejected', resetsAt: Math.floor(Date.now() / 1000) + 3600 }
    })
    finish('a')
    await flush()
    expect(sent.map((s) => s.featureId)).toEqual(['a'])
  })
})

describe('resuming after a pause', () => {
  it('compacts a big conversation whose cache has expired', () => {
    const { store, manager, add } = setup(0)
    add('a', { sessionId: 's', contextTokens: 150_000 })
    store.appendEvent('a', { kind: 'user', text: 'earlier' })
    vi.useFakeTimers({ now: Date.now() + 2 * HOUR, toFake: ['Date'] })
    try {
      manager.send('a', 'Continue')
    } finally {
      vi.useRealTimers()
    }
    expect(sent).toEqual([{ featureId: 'a', text: 'Continue', compactFirst: true }])
  })

  it('leaves a recent or small conversation alone', () => {
    const { store, manager, add } = setup(0)
    add('recent', { sessionId: 's', contextTokens: 150_000 })
    store.appendEvent('recent', { kind: 'user', text: 'earlier' })
    add('small', { sessionId: 's', contextTokens: 20_000 })
    store.appendEvent('small', { kind: 'user', text: 'earlier' })
    manager.send('recent', 'go')
    vi.useFakeTimers({ now: Date.now() + 2 * HOUR, toFake: ['Date'] })
    try {
      manager.send('small', 'go')
    } finally {
      vi.useRealTimers()
    }
    expect(sent.map((s) => s.compactFirst)).toEqual([false, false])
  })

  it('counts the compaction in the cost and the new size of the conversation', () => {
    const { store, add, manager } = setup(0)
    add('a', { costUsd: 1, contextTokens: 150_000 })
    manager.send('a', 'go')
    agents.get('a')!.emit({ type: 'compacted', ok: true, preTokens: 150_000, postTokens: 12_000, costUsd: 0.5 })
    expect(store.getFeature('a')).toMatchObject({ costUsd: 1.5, contextTokens: 12_000 })
  })
})

describe('usage warnings', () => {
  it('warns once per usage window', () => {
    const { manager, add, warnings } = setup(0)
    add('a')
    manager.send('a', 'go')
    const warn = (resetsAt: number) =>
      agents.get('a')!.emit({ type: 'event', event: { kind: 'rate_limit', status: 'allowed_warning', resetsAt, utilization: 0.9 } })
    warn(100)
    warn(100)
    warn(200)
    expect(warnings).toEqual([
      { limitType: undefined, resetsAt: 100, utilization: 0.9 },
      { limitType: undefined, resetsAt: 200, utilization: 0.9 }
    ])
  })
})
