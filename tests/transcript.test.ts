import { describe, expect, it } from 'vitest'
import { buildTranscript, toolSummary } from '../src/renderer/src/transcript'
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
