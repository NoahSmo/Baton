import type { LinearIssue } from '../../shared/types'
import { useT } from './i18n'

const STATE_TYPE_ORDER = ['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled']

/** Dot color per Linear workflow category, reusing the feature status palette. */
export const STATE_TYPE_DOT: Record<string, string> = { triage: 'waiting', started: 'working', completed: 'done' }

interface Props {
  issues: LinearIssue[]
  /** Selected state names; empty means every state. */
  selected: string[]
  onChange(selected: string[]): void
}

/** Chips to narrow a list of issues down to some workflow states. */
export function IssueStateFilter({ issues, selected, onChange }: Props) {
  const t = useT()

  // States present in the list, in the order work moves through them.
  const states = [...new Map(issues.map((i) => [i.stateName, i.stateType])).entries()]
    .map(([name, type]) => ({ name, type, count: issues.filter((i) => i.stateName === name).length }))
    .sort((a, b) => STATE_TYPE_ORDER.indexOf(a.type) - STATE_TYPE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name))

  if (states.length < 2) return null

  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((s) => s !== name) : [...selected, name])

  return (
    <div className="filters issue-states" role="group" aria-label={t.sidebar.filterByStatus}>
      <button type="button" className={`filter${selected.length ? '' : ' selected'}`} onClick={() => onChange([])}>
        {t.sidebar.all} <span className="num">{issues.length}</span>
      </button>
      {states.map((s) => (
        <button
          type="button"
          key={s.name}
          className={`filter${selected.includes(s.name) ? ' selected' : ''}`}
          aria-pressed={selected.includes(s.name)}
          onClick={() => toggle(s.name)}
        >
          <span className={`dot ${STATE_TYPE_DOT[s.type] ?? ''} still`} />
          {s.name} <span className="num">{s.count}</span>
        </button>
      ))}
    </div>
  )
}

export function matchesIssueFilter(issue: LinearIssue, states: string[], text: string): boolean {
  return (
    (!states.length || states.includes(issue.stateName)) &&
    `${issue.identifier} ${issue.title}`.toLowerCase().includes(text.trim().toLowerCase())
  )
}
