import { describe, expect, it } from 'vitest'
import { needsAttention, nextStatus, slugify } from '../src/shared/status'
import type { FeatureStatus, UiEvent } from '../src/shared/types'

const run = (events: UiEvent[], from: FeatureStatus = 'idle') => events.reduce(nextStatus, from)

const result = (over: Partial<Extract<UiEvent, { kind: 'result' }>> = {}): UiEvent => ({
  kind: 'result',
  isError: false,
  interrupted: false,
  text: '',
  turnCostUsd: 0,
  ...over
})

const permission: UiEvent = {
  kind: 'permission_request',
  requestId: 'r1',
  toolName: 'Bash',
  input: {},
  canAlwaysAllow: false
}

describe('nextStatus', () => {
  it('follows a plain turn from working to done', () => {
    expect(run([{ kind: 'user', text: 'go' }])).toBe('working')
    expect(run([{ kind: 'user', text: 'go' }, { kind: 'assistant_text', text: 'ok' }, result()])).toBe('done')
  })

  it('waits on a permission request and resumes once answered', () => {
    expect(run([{ kind: 'user', text: 'go' }, permission])).toBe('waiting')
    expect(
      run([{ kind: 'user', text: 'go' }, permission, { kind: 'permission_resolved', requestId: 'r1', behavior: 'allow' }])
    ).toBe('working')
  })

  it('does not revive a finished turn when a late answer arrives', () => {
    expect(nextStatus('idle', { kind: 'permission_resolved', requestId: 'r1', behavior: 'deny' })).toBe('idle')
  })

  it('goes idle on interruption, even when the turn ends as an error', () => {
    expect(run([{ kind: 'user', text: 'go' }, result({ isError: true, interrupted: true })])).toBe('idle')
  })

  it('reports failed turns', () => {
    expect(run([{ kind: 'user', text: 'go' }, result({ isError: true })])).toBe('error')
  })

  it('keeps the usage-limit status through the failed turn that follows it', () => {
    const events: UiEvent[] = [
      { kind: 'user', text: 'go' },
      { kind: 'rate_limit', status: 'rejected', resetsAt: 1 },
      result({ isError: true })
    ]
    expect(run(events)).toBe('limited')
    expect(run([...events, { kind: 'user', text: 'retry' }])).toBe('working')
  })

  it('ignores usage warnings', () => {
    expect(nextStatus('working', { kind: 'rate_limit', status: 'allowed_warning' })).toBe('working')
  })
})

describe('needsAttention', () => {
  it('flags only statuses the user must look at', () => {
    expect((['idle', 'working', 'waiting', 'done', 'error', 'limited'] as const).filter(needsAttention)).toEqual([
      'waiting',
      'done',
      'error',
      'limited'
    ])
  })
})

describe('slugify', () => {
  it('makes branch-safe slugs', () => {
    expect(slugify('Mode sombre: réglages & thème')).toBe('mode-sombre-reglages-theme')
    expect(slugify('  --Hello__World--  ')).toBe('hello-world')
  })

  it('falls back when nothing usable remains', () => {
    expect(slugify('🎉')).toBe('feature')
  })

  it('caps length without a trailing dash', () => {
    const slug = slugify('a'.repeat(47) + ' bcd')
    expect(slug.length).toBeLessThanOrEqual(48)
    expect(slug.endsWith('-')).toBe(false)
  })
})
