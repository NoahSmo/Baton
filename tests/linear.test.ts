import { describe, expect, it } from 'vitest'
import { LinearClient, pickStartedState } from '../src/main/linear'
import { issuePrompt } from '../src/shared/linear'
import type { LinearIssue } from '../src/shared/types'

const issue: LinearIssue = {
  id: 'i1',
  identifier: 'ENG-12',
  title: 'Dark mode',
  description: '  Add a toggle.  ',
  url: 'https://linear.app/acme/issue/ENG-12',
  branchName: 'sam/eng-12-dark-mode',
  stateName: 'Todo',
  stateType: 'unstarted',
  stateId: 's1',
  teamId: 't1',
  linearProjectId: 'p1',
  assigneeName: 'Sam',
  priority: 2
}

/** The issue as Linear's API returns it, before flattening. */
const rawIssue = {
  id: issue.id,
  identifier: issue.identifier,
  title: issue.title,
  description: issue.description,
  url: issue.url,
  branchName: issue.branchName,
  state: { id: 's1', name: 'Todo', type: 'unstarted' },
  team: { id: 't1' },
  project: { id: 'p1' },
  assignee: { name: 'Sam' },
  priority: 2
}

const states = [
  { id: 's1', name: 'Todo', type: 'unstarted', position: 1 },
  { id: 's3', name: 'In Review', type: 'started', position: 3 },
  { id: 's2', name: 'In Progress', type: 'started', position: 2 },
  { id: 's4', name: 'Done', type: 'completed', position: 4 }
]

/** Fake Linear endpoint answering each request from a queue and recording what it was sent. */
function fakeLinear(...responses: unknown[]) {
  const calls: { headers: Record<string, string>; body: { query: string; variables: Record<string, unknown> } }[] = []
  const fetchImpl = (async (_url: unknown, init: RequestInit) => {
    calls.push({ headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) })
    const next = responses.shift() as { status?: number; body: unknown }
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 })
  }) as typeof fetch
  return { calls, client: new LinearClient(() => 'lin_api_test', undefined, fetchImpl) }
}

describe('issuePrompt', () => {
  it('joins identifier, description and link', () => {
    expect(issuePrompt(issue)).toBe(
      'ENG-12: Dark mode\n\nAdd a toggle.\n\nLinear issue: https://linear.app/acme/issue/ENG-12'
    )
  })

  it('skips an empty description', () => {
    expect(issuePrompt({ ...issue, description: null })).toBe(
      'ENG-12: Dark mode\n\nLinear issue: https://linear.app/acme/issue/ENG-12'
    )
  })
})

describe('pickStartedState', () => {
  it('takes the earliest started state', () => {
    expect(pickStartedState(states)?.name).toBe('In Progress')
  })

  it('returns nothing for a workflow without a started state', () => {
    expect(pickStartedState(states.filter((s) => s.type !== 'started'))).toBeUndefined()
  })
})

describe('LinearClient', () => {
  it('sends the key as is and maps assigned issues', async () => {
    const { client, calls } = fakeLinear({
      body: { data: { viewer: { assignedIssues: { nodes: [{ ...rawIssue, project: null, assignee: null }] } } } }
    })
    const [mapped] = await client.myIssues()
    expect(mapped).toEqual({ ...issue, linearProjectId: null, assigneeName: null })
    expect(mapped).not.toHaveProperty('state')
    expect(calls[0].headers.Authorization).toBe('lin_api_test')
  })

  it('asks only for the open issues of the given project', async () => {
    const { client, calls } = fakeLinear({ body: { data: { issues: { nodes: [rawIssue] } } } })
    expect(await client.projectIssues('p1')).toEqual([issue])
    expect(calls[0].body.variables).toEqual({ projectId: 'p1' })
    expect(calls[0].body.query).toContain('project: { id: { eq: $projectId } }')
  })

  it('lists workspace projects with their labels', async () => {
    const labels = [{ id: 'l1', name: 'Infra' }]
    const { client } = fakeLinear({
      body: {
        data: {
          projects: {
            nodes: [{ id: 'p1', name: 'Mobile app', labels: { nodes: labels }, teams: { nodes: [{ id: 't1', name: 'Eng' }] } }]
          }
        }
      }
    })
    expect(await client.projects()).toEqual([
      { id: 'p1', name: 'Mobile app', labels, teams: [{ id: 't1', name: 'Eng' }] }
    ])
  })

  it('creates an issue in a team and project', async () => {
    const { client, calls } = fakeLinear({
      body: { data: { issueCreate: { success: true, issue: rawIssue } } }
    })
    const input = { title: 'Dark mode', description: 'Add a toggle.', teamId: 't1', projectId: 'p1' }
    expect(await client.createIssue(input)).toEqual(issue)
    expect(calls[0].body.query).toContain('issueCreate')
    expect(calls[0].body.variables).toEqual({ input })
  })

  it('leaves the description out when it is empty', async () => {
    const { client, calls } = fakeLinear({
      body: { data: { issueCreate: { success: true, issue: rawIssue } } }
    })
    await client.createIssue({ title: 'Dark mode', description: '', teamId: 't1', projectId: 'p1' })
    expect((calls[0].body.variables as { input: { description?: string } }).input.description).toBeUndefined()
  })

  it('fails when Linear does not create the issue', async () => {
    const { client } = fakeLinear({ body: { data: { issueCreate: { success: false, issue: null } } } })
    await expect(
      client.createIssue({ title: 'x', description: '', teamId: 't1', projectId: 'p1' })
    ).rejects.toThrow('Linear did not create the issue.')
  })

  it('lists project labels by name, without groups', async () => {
    const { client, calls } = fakeLinear({
      body: { data: { projectLabels: { nodes: [{ id: 'l2', name: 'Infra' }, { id: 'l1', name: 'Comparateur' }] } } }
    })
    expect((await client.projectLabels()).map((l) => l.name)).toEqual(['Comparateur', 'Infra'])
    expect(calls[0].body.query).toContain('isGroup: { eq: false }')
  })

  it('asks for the open issues of the projects carrying a label', async () => {
    const { client, calls } = fakeLinear({ body: { data: { issues: { nodes: [rawIssue] } } } })
    expect(await client.labelIssues('l1')).toEqual([issue])
    expect(calls[0].body.variables).toEqual({ labelId: 'l1' })
    expect(calls[0].body.query).toContain('labels: { some: { id: { eq: $labelId } } }')
  })

  it('returns team states in workflow order', async () => {
    const { client } = fakeLinear({ body: { data: { team: { states: { nodes: [...states].reverse() } } } } })
    expect((await client.teamStates('t1')).map((s) => s.name)).toEqual(['Todo', 'In Progress', 'In Review', 'Done'])
  })

  it('moves an unstarted issue to the first started state', async () => {
    const { client, calls } = fakeLinear(
      { body: { data: { issue: { state: { type: 'unstarted' }, team: { states: { nodes: states } } } } } },
      { body: { data: { issueUpdate: { success: true } } } }
    )
    expect(await client.markStarted('i1')).toBe('In Progress')
    expect(calls[1].body.variables).toEqual({ id: 'i1', stateId: 's2' })
  })

  it('leaves an issue that is already under way untouched', async () => {
    const { client, calls } = fakeLinear({
      body: { data: { issue: { state: { type: 'started' }, team: { states: { nodes: states } } } } }
    })
    expect(await client.markStarted('i1')).toBeNull()
    expect(calls).toHaveLength(1)
  })

  it('surfaces GraphQL errors', async () => {
    const { client } = fakeLinear({ status: 400, body: { errors: [{ message: 'Authentication required' }] } })
    await expect(client.viewerName()).rejects.toThrow('Authentication required')
  })

  it('refuses to call Linear without a key', async () => {
    await expect(new LinearClient(() => null).myIssues()).rejects.toThrow('not connected')
  })
})
