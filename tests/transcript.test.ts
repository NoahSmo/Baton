import { describe, expect, it } from 'vitest'
import { buildTranscript, pendingRequest, toolSummary } from '../src/renderer/src/transcript'
import { DICTS } from '../src/shared/i18n'
import type { StoredEvent, UiEvent } from '../src/shared/types'

const build = (events: StoredEvent[], lang: 'en' | 'fr' = 'en') => buildTranscript(events, DICTS[lang], lang)

const journal = (events: UiEvent[]): StoredEvent[] =>
  events.map((event, i) => ({ seq: i + 1, featureId: 'f', at: 0, event }))

describe('buildTranscript', () => {
  it('attaches tool results to their call', () => {
    const { items } = build(
      journal([
        { kind: 'tool_use', toolUseId: 't1', name: 'Bash', input: { command: 'ls' } },
        { kind: 'tool_use', toolUseId: 't2', name: 'Read', input: { file_path: 'a.ts' } },
        { kind: 'tool_result', toolUseId: 't2', content: 'file', isError: false },
        { kind: 'tool_result', toolUseId: 't1', content: 'boom', isError: true }
      ])
    )
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ type: 'tool', name: 'Bash', result: { content: 'boom', isError: true } })
    expect(items[1]).toMatchObject({ type: 'tool', name: 'Read', result: { content: 'file', isError: false } })
  })

  it('keeps the attachments of a user message', () => {
    const image = { name: 'a.png', mediaType: 'image/png' as const }
    const file = { name: 'b-spec.xlsx', label: 'spec.xlsx', size: 3 }
    const { items } = build(
      journal([
        { kind: 'user', text: 'look', images: [image], files: [file] },
        { kind: 'user', text: 'plain' }
      ])
    )
    expect(items[0]).toMatchObject({ type: 'user', text: 'look', images: [image], files: [file] })
    expect(items[1]).toMatchObject({ type: 'user', text: 'plain', images: [], files: [] })
  })

  it('flags calls left without a result when their turn ends', () => {
    const { items } = build(
      journal([
        { kind: 'tool_use', toolUseId: 't1', name: 'Bash', input: {} },
        { kind: 'notice', notice: { code: 'app_closed' } },
        { kind: 'tool_use', toolUseId: 't2', name: 'Bash', input: {} }
      ])
    )
    expect(items[0]).toMatchObject({ type: 'tool', orphaned: true })
    expect(items[2]).not.toHaveProperty('orphaned')
  })

  it('marks permission requests as resolved', () => {
    const { items } = build(
      journal([
        { kind: 'permission_request', requestId: 'r1', toolName: 'Bash', input: {}, canAlwaysAllow: true },
        { kind: 'permission_request', requestId: 'r2', toolName: 'Edit', input: {}, canAlwaysAllow: false },
        { kind: 'permission_resolved', requestId: 'r1', behavior: 'deny' }
      ])
    )
    expect(items[0]).toMatchObject({ type: 'permission', resolved: 'deny' })
    expect(items[1]).toMatchObject({ type: 'permission' })
    expect(items[1]).not.toHaveProperty('resolved')
  })

  it('lifts the latest task list out of the transcript', () => {
    const { items, todos } = build(
      journal([
        { kind: 'tool_use', toolUseId: 't1', name: 'TodoWrite', input: { todos: [{ content: 'a', status: 'pending' }] } },
        {
          kind: 'tool_use',
          toolUseId: 't2',
          name: 'TodoWrite',
          input: { todos: [{ content: 'a', status: 'completed' }, { content: 'b', status: 'in_progress' }] }
        }
      ])
    )
    expect(items).toHaveLength(0)
    expect(todos.map((t) => t.status)).toEqual(['completed', 'in_progress'])
  })

  it('shows the error text of a failed turn but not of an interrupted one', () => {
    const { items } = build(
      journal([
        { kind: 'result', isError: true, interrupted: false, text: 'bad', turnCostUsd: 0.5 },
        { kind: 'result', isError: true, interrupted: true, text: 'aborted', turnCostUsd: 0 }
      ])
    )
    expect(items[0]).toMatchObject({ type: 'turn_end', error: 'bad', costUsd: 0.5 })
    expect(items[1]).toMatchObject({ type: 'turn_end', interrupted: true })
    expect(items[1]).not.toHaveProperty('error')
  })

  it('warns once per usage window', () => {
    const { items } = build(
      journal([
        { kind: 'rate_limit', status: 'allowed_warning', resetsAt: 100 },
        { kind: 'rate_limit', status: 'allowed_warning', resetsAt: 100 },
        { kind: 'rate_limit', status: 'allowed_warning', resetsAt: 200 }
      ])
    )
    expect(items).toHaveLength(2)
  })

  it('surfaces usage-limit rejections only', () => {
    const { items } = build(
      journal([
        { kind: 'rate_limit', status: 'allowed' },
        { kind: 'rate_limit', status: 'rejected' }
      ])
    )
    expect(items).toEqual([{ type: 'note', seq: 2, tone: 'error', text: 'Usage limit reached.' }])
  })
})

describe('notices', () => {
  it('explains a compaction and a queued message', () => {
    const { items } = build(
      journal([
        { kind: 'notice', notice: { code: 'context_compacted', preTokens: 152_340, postTokens: 9_800 } },
        { kind: 'notice', notice: { code: 'queued', maxRunning: 2 } }
      ]),
      'fr'
    )
    expect(items.map((i) => i.type === 'note' && i.text)).toEqual([
      'Reprise après une longue pause : conversation résumée (152k → 10k tokens) au lieu d\'être repayée en entier.',
      "En file : 2 agents tournent déjà. Démarre dès qu'un a fini."
    ])
  })


  const events = journal([
    { kind: 'notice', notice: { code: 'linear_moved', identifier: 'ENG-1', state: 'In Progress' } },
    { kind: 'notice', text: 'Sentence stored by an older version.' },
    { kind: 'rate_limit', status: 'rejected' }
  ])

  it('renders stored notices in the selected language', () => {
    expect(build(events, 'en').items.map((i) => i.type === 'note' && i.text)).toEqual([
      'Linear: ENG-1 moved to In Progress.',
      'Sentence stored by an older version.',
      'Usage limit reached.'
    ])
    expect(build(events, 'fr').items.map((i) => i.type === 'note' && i.text)).toEqual([
      'Linear : ENG-1 passée en In Progress.',
      'Sentence stored by an older version.',
      "Limite d'utilisation atteinte."
    ])
  })
})

describe('toolSummary', () => {
  it('uses the first line of the most telling field', () => {
    expect(toolSummary({ command: 'npm test\n&& echo done', description: 'Run tests' })).toBe('npm test')
    expect(toolSummary({ foo: 1 })).toBe('')
  })
})

describe('pendingRequest', () => {
  const ask = (requestId: string, toolName: string): UiEvent => ({ kind: 'permission_request', requestId, toolName, input: {}, canAlwaysAllow: false })

  it('finds the oldest request nobody answered', () => {
    const events = journal([ask('r1', 'Bash'), ask('r2', 'Edit'), { kind: 'permission_resolved', requestId: 'r1', behavior: 'allow' }])
    expect(pendingRequest(events)).toEqual({ requestId: 'r2' })
  })

  it('leaves questions to the user, and says so when nothing is left', () => {
    expect(pendingRequest(journal([ask('q', 'AskUserQuestion')]))).toBeNull()
    expect(pendingRequest(journal([ask('q', 'AskUserQuestion'), ask('r', 'Bash')]))).toEqual({ requestId: 'r' })
    expect(pendingRequest(journal([ask('r', 'Bash'), { kind: 'permission_resolved', requestId: 'r', behavior: 'deny' }]))).toBeNull()
    expect(pendingRequest([])).toBeNull()
  })
})
