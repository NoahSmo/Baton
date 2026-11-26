import { describe, expect, it } from 'vitest'
import { collectArtifacts, toolArtifacts } from '../src/renderer/src/artifacts'
import type { Item, ToolItem } from '../src/renderer/src/transcript'

const tool = (seq: number, input: Record<string, unknown>, content: string): ToolItem => ({
  type: 'tool',
  seq,
  name: 'Artifact',
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
