import { DICTS, type Dict } from '../shared/i18n'
import type { CreateLinearIssueInput, LinearIssue, LinearLabel, LinearProject, LinearState, LinearTeam } from '../shared/types'

// Overridable so the app can be exercised against a local stand-in for Linear.
const ENDPOINT = process.env.BATON_LINEAR_URL ?? 'https://api.linear.app/graphql'

/** Linear's workflow categories, in the order work moves through them. */
const STATE_TYPE_ORDER = ['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled']

/** The state an issue moves to when work begins: the team's first "started" state. */
export function pickStartedState(states: LinearState[]): LinearState | undefined {
  return states.filter((s) => s.type === 'started').sort((a, b) => a.position - b.position)[0]
}

const ISSUE_FIELDS =
  'id identifier title description url branchName state { id name type } team { id } project { id } assignee { name }'

interface RawIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  url: string
  branchName: string
  state: { id: string; name: string; type: string }
  team: { id: string }
  project: { id: string } | null
  assignee: { name: string } | null
}

function toIssue({ state, team, project, assignee, ...issue }: RawIssue): LinearIssue {
  return {
    ...issue,
    stateName: state.name,
    stateType: state.type,
    stateId: state.id,
    teamId: team.id,
    linearProjectId: project?.id ?? null,
    assigneeName: assignee?.name ?? null
  }
}

export class LinearClient {
  constructor(
    private readonly getKey: () => string | null,
    private readonly t: () => Dict = () => DICTS.en,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async request<T>(query: string, variables: Record<string, unknown> = {}, key = this.getKey()): Promise<T> {
    if (!key) throw new Error(this.t().errors.linearNotConnected)
    const res = await this.fetchImpl(ENDPOINT, {
      method: 'POST',
      // Personal API keys go in the header as is, without a Bearer prefix.
      headers: { 'Content-Type': 'application/json', Authorization: key },
      body: JSON.stringify({ query, variables })
    })
    const body = (await res.json().catch(() => null)) as { data?: T; errors?: { message: string }[] } | null
    if (body?.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '))
    if (!res.ok || !body?.data) throw new Error(this.t().errors.linearHttp(res.status))
    return body.data
  }

  /** Name of the account behind a key; throws when the key is rejected. */
  async viewerName(key?: string): Promise<string> {
    const data = await this.request<{ viewer: { name: string } }>('query { viewer { name } }', {}, key ?? this.getKey())
    return data.viewer.name
  }

  /** Projects of the workspace, most recently updated first. */
  async projects(): Promise<LinearProject[]> {
    const data = await this.request<{
      projects: {
        nodes: { id: string; name: string; labels: { nodes: LinearLabel[] }; teams: { nodes: LinearTeam[] } }[]
      }
    }>(
      'query { projects(first: 100, orderBy: updatedAt) { nodes { id name labels { nodes { id name } } teams { nodes { id name } } } } }'
    )
    return data.projects.nodes.map(({ labels, teams, ...project }) => ({
      ...project,
      labels: labels.nodes,
      teams: teams.nodes
    }))
  }

  /** Project labels of the workspace, by name. Groups are left out: they cannot be put on a project. */
  async projectLabels(): Promise<LinearLabel[]> {
    const data = await this.request<{ projectLabels: { nodes: LinearLabel[] } }>(
      'query { projectLabels(first: 250, filter: { isGroup: { eq: false } }) { nodes { id name } } }'
    )
    return data.projectLabels.nodes.sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Open issues of every project carrying a label, most recently updated first. */
  async labelIssues(labelId: string): Promise<LinearIssue[]> {
    const data = await this.request<{ issues: { nodes: RawIssue[] } }>(
      `query($labelId: ID!) {
        issues(
          first: 100
          orderBy: updatedAt
          filter: {
            project: { labels: { some: { id: { eq: $labelId } } } }
            state: { type: { nin: ["completed", "canceled"] } }
          }
        ) { nodes { ${ISSUE_FIELDS} } }
      }`,
      { labelId }
    )
    return data.issues.nodes.map(toIssue)
  }

  /** Open issues of one project, whoever they are assigned to, most recently updated first. */
  async projectIssues(projectId: string): Promise<LinearIssue[]> {
    const data = await this.request<{ issues: { nodes: RawIssue[] } }>(
      `query($projectId: ID!) {
        issues(
          first: 100
          orderBy: updatedAt
          filter: { project: { id: { eq: $projectId } }, state: { type: { nin: ["completed", "canceled"] } } }
        ) { nodes { ${ISSUE_FIELDS} } }
      }`,
      { projectId }
    )
    return data.issues.nodes.map(toIssue)
  }

  /** Open issues assigned to the connected user, most recently updated first. */
  async myIssues(): Promise<LinearIssue[]> {
    const data = await this.request<{
      viewer: { assignedIssues: { nodes: RawIssue[] } }
    }>(
      `query {
        viewer {
          assignedIssues(
            first: 100
            orderBy: updatedAt
            filter: { state: { type: { nin: ["completed", "canceled"] } } }
          ) { nodes { ${ISSUE_FIELDS} } }
        }
      }`
    )
    return data.viewer.assignedIssues.nodes.map(toIssue)
  }

  /**
   * Moves an issue to its team's first "started" state.
   * Returns the new state name, or null when the issue was already started or closed.
   */
  async markStarted(issueId: string): Promise<string | null> {
    const data = await this.request<{
      issue: { state: { type: string }; team: { states: { nodes: LinearState[] } } }
    }>(
      `query($id: String!) {
        issue(id: $id) { state { type } team { states { nodes { id name type position } } } }
      }`,
      { id: issueId }
    )
    if (!['triage', 'backlog', 'unstarted'].includes(data.issue.state.type)) return null
    const target = pickStartedState(data.issue.team.states.nodes)
    if (!target) return null
    await this.setIssueState(issueId, target.id)
    return target.name
  }

  async teamStates(teamId: string): Promise<LinearState[]> {
    const data = await this.request<{ team: { states: { nodes: LinearState[] } } }>(
      'query($id: String!) { team(id: $id) { states { nodes { id name type position } } } }',
      { id: teamId }
    )
    return data.team.states.nodes.sort(
      (a, b) => STATE_TYPE_ORDER.indexOf(a.type) - STATE_TYPE_ORDER.indexOf(b.type) || a.position - b.position
    )
  }

  /** Creates an issue in a team, inside a Linear project. */
  async createIssue(input: CreateLinearIssueInput): Promise<LinearIssue> {
    const data = await this.request<{ issueCreate: { success: boolean; issue: RawIssue | null } }>(
      `mutation($input: IssueCreateInput!) {
        issueCreate(input: $input) { success issue { ${ISSUE_FIELDS} } }
      }`,
      { input: { ...input, description: input.description || undefined } }
    )
    if (!data.issueCreate.success || !data.issueCreate.issue) throw new Error(this.t().errors.linearCreateFailed)
    return toIssue(data.issueCreate.issue)
  }

  async setIssueState(issueId: string, stateId: string): Promise<void> {
    await this.request(
      `mutation($id: String!, $stateId: String!) {
        issueUpdate(id: $id, input: { stateId: $stateId }) { success }
      }`,
      { id: issueId, stateId }
    )
  }
}
