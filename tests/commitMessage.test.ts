import { describe, expect, it } from 'vitest'
import { clip, parseMessage } from '../src/main/commitMessage'

describe('parseMessage', () => {
  it('keeps the message, trimmed', () => {
    expect(parseMessage({ message: '  Fix bug\n\n- one\n' })).toBe('Fix bug\n\n- one')
  })

  it('drops a code fence around it', () => {
    expect(parseMessage({ message: '```\nFix bug\n```' })).toBe('Fix bug')
  })

  it('gives nothing for an answer without a message', () => {
    expect(parseMessage(null)).toBe('')
    expect(parseMessage({ message: 3 })).toBe('')
  })
})

describe('clip', () => {
  it('leaves a short diff alone', () => {
    expect(clip('a')).toBe('a')
  })

  it('cuts a long diff and says so', () => {
    const out = clip('a'.repeat(40_000))
    expect(out.length).toBeLessThan(31_000)
    expect(out.endsWith('(diff cut)')).toBe(true)
  })
})
