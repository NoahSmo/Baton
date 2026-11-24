import { describe, expect, it } from 'vitest'
import { byServer, contextRows, type ContextUsage } from '../src/shared/context'

const usage = (categories: ContextUsage['categories']): ContextUsage => ({
  model: 'claude-opus-5-5',
  totalTokens: 0,
  maxTokens: 1000,
  percentage: 0,
  categories,
  mcpServers: [],
  memoryFiles: [],
  skills: []
})

describe('contextRows', () => {
  it('sorts what is used, then reserve and free space, then deferred, dropping empty rows', () => {
    const rows = contextRows(
      usage([
        { id: 'free_space', name: 'Free space', tokens: 600, kind: 'free' },
        { id: 'system_prompt', name: 'System prompt', tokens: 100, kind: 'used' },
        { id: 'messages', name: 'Messages', tokens: 250, kind: 'used' },
        { id: 'skills', name: 'Skills', tokens: 0, kind: 'used' },
        { id: 'autocompact_buffer', name: 'Autocompact buffer', tokens: 50, kind: 'buffer' },
        { id: 'mcp_tools_deferred', name: 'MCP tools (deferred)', tokens: 9000, kind: 'deferred' }
      ])
    )
    expect(rows.used.map((r) => [r.id, r.share])).toEqual([
      ['messages', 25],
      ['system_prompt', 10]
    ])
    expect(rows.rest.map((r) => r.id)).toEqual(['autocompact_buffer', 'free_space'])
    expect(rows.deferred).toEqual([{ id: 'mcp_tools_deferred', name: 'MCP tools (deferred)', tokens: 9000, kind: 'deferred', share: null }])
  })
})

describe('byServer', () => {
  it('sums tools per server, largest first', () => {
    expect(
      byServer([
        { serverName: 'linear', tokens: 10 },
        { serverName: 'slack', tokens: 30 },
        { serverName: 'linear', tokens: 25 }
      ])
    ).toEqual([
      { name: 'linear', tokens: 35 },
      { name: 'slack', tokens: 30 }
    ])
  })
})
