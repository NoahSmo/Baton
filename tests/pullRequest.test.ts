import { describe, expect, it } from 'vitest'
import { parseStatus } from '../src/main/pullRequest'

const base = { number: 7, url: 'https://github.com/o/r/pull/7', state: 'OPEN', isDraft: false, mergeable: 'MERGEABLE', reviewDecision: 'APPROVED' }

describe('parseStatus', () => {
  it('reads state, review and mergeability', () => {
    expect(parseStatus({ ...base, statusCheckRollup: [] })).toEqual({
      number: 7,
      url: base.url,
      state: 'open',
      draft: false,
      mergeable: true,
      review: 'approved',
      checks: { passed: 0, failed: 0, pending: 0 }
    })
    expect(parseStatus({ ...base, state: 'MERGED', mergeable: 'UNKNOWN', reviewDecision: '' })).toMatchObject({ state: 'merged', mergeable: null, review: null })
    expect(parseStatus({ ...base, mergeable: 'CONFLICTING', isDraft: true })).toMatchObject({ mergeable: false, draft: true })
  })

  it('counts check runs and commit statuses', () => {
    const status = parseStatus({
      ...base,
      statusCheckRollup: [
        { status: 'COMPLETED', conclusion: 'SUCCESS' },
        { status: 'COMPLETED', conclusion: 'SKIPPED' },
        { status: 'COMPLETED', conclusion: 'FAILURE' },
        { status: 'IN_PROGRESS', conclusion: '' },
        { state: 'PENDING' },
        { state: 'SUCCESS' }
      ]
    })
    expect(status?.checks).toEqual({ passed: 3, failed: 1, pending: 2 })
  })

  it('refuses what is not a pull request', () => {
    expect(parseStatus(null)).toBeNull()
    expect(parseStatus({ state: 'OPEN' })).toBeNull()
  })
})
