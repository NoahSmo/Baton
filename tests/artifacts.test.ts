import { describe, expect, it } from 'vitest'
import { collectArtifacts, toolArtifacts } from '../src/renderer/src/artifacts'
import type { Item, ToolItem } from '../src/renderer/src/transcript'

const tool = (seq: number, input: Record<string, unknown>, content: string, name = 'Artifact'): ToolItem => ({
  type: 'tool',
  seq,
  name,
  input,
  result: { content, isError: false }
})

describe('toolArtifacts', () => {
  it('finds the link a tool returned, named after its input', () => {
    const found = toolArtifacts([tool(1, { title: 'Roadmap' }, 'Published: https://claude.ai/artifact/AbC_12-x')])
    expect(found).toEqual([{ url: 'https://claude.ai/artifact/AbC_12-x', title: 'Roadmap', seq: 1 }])
  })

  it('falls back on the id and ignores other links', () => {
    const found = toolArtifacts([tool(1, {}, 'https://claude.ai/public/artifacts/xyz https://example.com/artifact/no')])
    expect(found).toEqual([{ url: 'https://claude.ai/public/artifacts/xyz', title: 'xyz', seq: 1 }])
  })

  it('finds nothing in plain calls', () => {
    expect(toolArtifacts([tool(1, { command: 'ls' }, 'a.ts')])).toEqual([])
  })

  it('ignores links other tools merely pass around', () => {
    const grep = tool(1, { pattern: 'claude.ai' }, 'notes.md: https://claude.ai/artifact/abc', 'Bash')
    const written = tool(2, { content: 'https://claude.ai/artifact/def' }, 'File created', 'Write')
    expect(toolArtifacts([grep, written])).toEqual([])
  })

  it('reads the link from the result, not from what the tool was sent', () => {
    expect(toolArtifacts([tool(1, { url: 'https://claude.ai/artifact/old' }, 'Updated')])).toEqual([])
  })

  it('accepts the claude.ai docs connector', () => {
    const found = toolArtifacts([tool(1, {}, 'Created https://claude.ai/artifact/doc1', 'mcp__claude_ai_Claude_Docs__batch')])
    expect(found.map((a) => a.url)).toEqual(['https://claude.ai/artifact/doc1'])
  })
})

describe('collectArtifacts', () => {
  it('lists each artifact once, the latest mention first, keeping the name its tool gave', () => {
    const items: Item[] = [
      tool(1, { title: 'Report' }, 'https://claude.ai/artifact/one'),
      { type: 'assistant', seq: 2, text: 'See [the deck](https://claude.ai/artifact/two).' },
      { type: 'assistant', seq: 3, text: 'Updated https://claude.ai/artifact/one' }
    ]
    expect(collectArtifacts(items)).toEqual([
      { url: 'https://claude.ai/artifact/one', title: 'Report', seq: 3 },
      { url: 'https://claude.ai/artifact/two', title: 'the deck', seq: 2 }
    ])
  })
})
