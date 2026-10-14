import { describe, expect, it } from 'vitest'
import { parseSuggestions } from '../src/main/suggest'

describe('parseSuggestions', () => {
  it('keeps named commands, trimmed', () => {
    expect(parseSuggestions({ commands: [{ name: ' Dev ', command: ' npm run dev ' }] })).toEqual([
      { name: 'Dev', command: 'npm run dev' }
    ])
  })

  it('drops what is not a command', () => {
    expect(parseSuggestions({ commands: [{ name: 'Empty', command: ' ' }, null, 'npm test', { command: 3 }] })).toEqual([])
    expect(parseSuggestions(null)).toEqual([])
    expect(parseSuggestions({ commands: 'npm test' })).toEqual([])
  })

  it('makes one line of a command given on several', () => {
    expect(parseSuggestions({ commands: [{ command: 'swift build\n\n.build/debug/App\n' }] })).toEqual([
      { name: '', command: 'swift build && .build/debug/App' }
    ])
  })

  it('stops at eight commands', () => {
    const commands = Array.from({ length: 12 }, (_, i) => ({ name: `c${i}`, command: `run ${i}` }))
    expect(parseSuggestions({ commands })).toHaveLength(8)
  })
})
