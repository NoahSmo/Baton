import { describe, expect, it } from 'vitest'
import { atEdge, sentMessages, START, stepHistory } from '../src/shared/history'

describe('stepHistory', () => {
  const history = ['one', 'two', 'three']

  it('walks back from the newest message and brings the draft back at the bottom', () => {
    const up1 = stepHistory(START, history, 'draft', 'up')!
    expect(up1.text).toBe('three')
    const up2 = stepHistory(up1.cursor, history, up1.text, 'up')!
    expect(up2.text).toBe('two')
    const down = stepHistory(up2.cursor, history, up2.text, 'down')!
    expect(down.text).toBe('three')
    const bottom = stepHistory(down.cursor, history, down.text, 'down')!
    expect(bottom).toEqual({ cursor: START, text: 'draft' })
  })

  it('stops at the oldest message and when there is nothing to browse', () => {
    let step = stepHistory(START, history, '', 'up')!
    step = stepHistory(step.cursor, history, step.text, 'up')!
    step = stepHistory(step.cursor, history, step.text, 'up')!
    expect(step.text).toBe('one')
    expect(stepHistory(step.cursor, history, step.text, 'up')).toBeNull()
    expect(stepHistory(START, [], '', 'up')).toBeNull()
    expect(stepHistory(START, history, 'x', 'down')).toBeNull()
  })
})

describe('atEdge', () => {
  it('lets the arrows move the caret inside a multi-line text', () => {
    const text = 'a\nb\nc'
    expect(atEdge(text, 0, 'up')).toBe(true)
    expect(atEdge(text, 3, 'up')).toBe(false)
    expect(atEdge(text, 3, 'down')).toBe(false)
    expect(atEdge(text, 5, 'down')).toBe(true)
    expect(atEdge('', 0, 'up')).toBe(true)
  })
})

describe('sentMessages', () => {
  it('keeps what the user wrote, oldest first, without repeats', () => {
    const ev = (kind: string, text?: string) => ({ event: { kind, text } })
    expect(sentMessages([ev('user', 'a'), ev('assistant_text', 'hi'), ev('user', 'a'), ev('user', ' '), ev('user', 'b')])).toEqual(['a', 'b'])
  })
})
