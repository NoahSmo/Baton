import { describe, expect, it } from 'vitest'
import { sessionEvents } from '../src/main/cliImport'

const msg = (type: 'user' | 'assistant', content: unknown, extra: object = {}) =>
  ({ type, uuid: 'u', session_id: 's', message: { role: type, content }, parent_tool_use_id: null, parent_agent_id: null, ...extra }) as never

describe('sessionEvents', () => {
  it('turns a CLI conversation into transcript events', () => {
    const events = sessionEvents([
      msg('user', 'fix the bug'),
      msg('assistant', [
        { type: 'thinking', thinking: 'hm' },
        { type: 'text', text: 'On it' },
        { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a.ts' } }
      ]),
      msg('user', [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'file' }], is_error: false }])
    ])
    expect(events).toEqual([
      { kind: 'user', text: 'fix the bug' },
      { kind: 'assistant_text', text: 'On it' },
      { kind: 'tool_use', toolUseId: 't1', name: 'Read', input: { file_path: 'a.ts' } },
      { kind: 'tool_result', toolUseId: 't1', content: 'file', isError: false }
    ])
  })

  it('skips subagent messages and empty text', () => {
    expect(sessionEvents([msg('assistant', 'x', { parent_tool_use_id: 'p' }), msg('user', '  ')])).toEqual([])
  })
})
