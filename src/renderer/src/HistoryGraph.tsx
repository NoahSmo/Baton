import { useEffect, useMemo, useState } from 'react'
import { layoutGraph, type GraphRow } from '../../shared/graph'
import type { AgentTurn, GitChange, GitCommit, GitStatus, MergePreview } from '../../shared/types'
import { openContextMenu } from './contextMenu'
import { DiffView } from './DiffView'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'

const LANE_WIDTH = 16
const ROW_HEIGHT = 34
const MID = ROW_HEIGHT / 2
const PAGE = 200
/** Commits land a moment after the result of the turn that made them is recorded, or just before it. */
const TURN_SLACK_MS = 5000
const COLORS = ['#9a8f84', '#e08e62', '#4fb7d6', '#a78bfa', '#6cbb7a', '#e0b252']

const colorOf = (lane: number) => COLORS[lane % COLORS.length]
const xOf = (lane: number) => lane * LANE_WIDTH + LANE_WIDTH / 2

/** Branch drawing of one row: lines in from above, lines out below, and the commit's dot. */
function Lines({ row, width }: { row: GraphRow; width: number }) {
  return (
    <svg className="graph-lines" width={width} height={ROW_HEIGHT} aria-hidden>
      {row.above.map(({ lane, toDot }) => (
        <path key={`a${lane}`} d={`M${xOf(lane)} 0 L${xOf(toDot ? row.lane : lane)} ${MID}`} stroke={colorOf(lane)} />
      ))}
      {row.below.map(({ from, to }, i) => (
        <path
          key={`b${i}`}
          d={from === to ? `M${xOf(from)} ${MID} L${xOf(to)} ${ROW_HEIGHT}` : `M${xOf(from)} ${MID} C${xOf(from)} ${ROW_HEIGHT} ${xOf(to)} ${MID} ${xOf(to)} ${ROW_HEIGHT}`}
          stroke={colorOf(to)}
        />
      ))}
      <circle cx={xOf(row.lane)} cy={MID} r={4.5} stroke={colorOf(row.lane)} style={row.commit.head ? { fill: colorOf(row.lane) } : undefined} />
    </svg>
  )
}

/** Short time since a commit: "3 min", "2 h", "5 d". */
function ago(seconds: number, now: number): string {
  const s = Math.max(0, now / 1000 - seconds)
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`
  if (s < 86400) return `${Math.round(s / 3600)} h`
  if (s < 86400 * 60) return `${Math.round(s / 86400)} d`
  return `${Math.round(s / (86400 * 30))} mo`
}

const KIND_MARK = { modified: 'M', added: 'A', deleted: 'D', renamed: 'R', untracked: 'U', conflicted: '!' } as const

interface Props {
  id: string
  git: GitStatus | null
  /** Opens the list of uncommitted files. */
  onShowChanges(): void
}

/** What the detail pane shows: a commit's own changes, or how it differs from the checked-out commit. */
interface Selection {
  commit: GitCommit
  compare: boolean
  branching: boolean
}

/** Commit graph of a worktree's repository: every branch, newest first. */
export function HistoryGraph({ id, git, onShowChanges }: Props) {
  const t = useT()
  const [limit, setLimit] = useState(PAGE)
  const [log, setLog] = useState<{ commits: GitCommit[]; more: boolean } | null>(null)
  const [turns, setTurns] = useState<AgentTurn[]>([])
  const [preview, setPreview] = useState<MergePreview | null>(null)
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [files, setFiles] = useState<GitChange[] | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [branchName, setBranchName] = useState('')
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)

  // A commit, a pull or a branch switch all move the status; the graph follows.
  useEffect(() => {
    let stale = false
    window.api
      .gitLog(id, limit)
      .then((result) => !stale && setLog(result))
      .catch(() => !stale && setLog({ commits: [], more: false }))
    window.api
      .gitTurns(id)
      .then((result) => !stale && setTurns(result))
      .catch(() => undefined)
    window.api
      .gitMergePreview(id)
      .then((result) => !stale && setPreview(result))
      .catch(() => !stale && setPreview(null))
    return () => {
      stale = true
    }
  }, [id, limit, git?.head, git?.branch, git?.ahead, git?.behind])

  const commits = log?.commits ?? []
  const head = commits.find((c) => c.head)
  const rows = useMemo(() => layoutGraph(commits), [commits])
  const width = Math.max(1, ...rows.map((r) => r.width)) * LANE_WIDTH
  const needle = query.trim().toLowerCase()
  const shown = needle
    ? rows.filter(({ commit }) =>
        [commit.subject, commit.author, commit.hash, ...commit.refs].some((field) => field.toLowerCase().includes(needle))
      )
    : rows
  const anyMine = commits.some((c) => c.mine)
  const now = Date.now()
  const headLane = rows.find((r) => r.commit.head)?.lane ?? 0

  const turnOf = (commit: GitCommit) => turns.find((turn) => commit.time * 1000 >= turn.start - TURN_SLACK_MS && commit.time * 1000 <= turn.end + TURN_SLACK_MS)

  // The files of the picked commit, or of its difference with the checked-out one.
  useEffect(() => {
    setFiles(null)
    setFilePath(null)
    if (!selection || selection.branching || (selection.compare && !head)) return
    let stale = false
    const { commit, compare } = selection
    window.api
      .gitCommitFiles(id, compare ? head!.hash : commit.hash, compare ? commit.hash : commit.parents[0])
      .then((result) => !stale && setFiles(result))
      .catch(() => !stale && setFiles([]))
    return () => {
      stale = true
    }
  }, [id, selection?.commit.hash, selection?.compare, selection?.branching, head?.hash])

  async function openMenu(e: React.MouseEvent, commit: GitCommit) {
    const action = await openContextMenu(e, { kind: 'commit', hash: commit.hash, subject: commit.subject })
    if (action === 'compare-commit') setSelection({ commit, compare: true, branching: false })
    else if (action === 'branch-commit') {
      setBranchName('')
      setSelection({ commit, compare: false, branching: true })
    } else if (action === 'cherry-pick-commit' || action === 'revert-commit') {
      await run(commit, action === 'revert-commit' ? 'revert' : 'cherry-pick')
    }
  }

  async function run(commit: GitCommit, action: 'cherry-pick' | 'revert' | 'branch', name?: string) {
    setNotice(null)
    try {
      await window.api.gitCommitAction(id, commit.hash, action, name)
      setNotice({ text: action === 'branch' ? t.git.branchCreated(name ?? '') : t.git.actionDone, error: false })
      if (action === 'branch') setSelection(null)
    } catch (err) {
      setNotice({ text: cleanError(err), error: true })
    }
  }

  if (!log) return <p className="editor-empty">{t.editor.loading}</p>
  if (!rows.length) return <p className="editor-empty">{t.git.noHistory}</p>

  const diffCommits =
    selection && filePath && head
      ? selection.compare
        ? { before: selection.commit.hash, after: head.hash }
        : { before: selection.commit.parents[0] ?? null, after: selection.commit.hash }
      : undefined
  const diffLabels: [string, string] | undefined = selection?.compare
    ? [selection.commit.hash.slice(0, 7), head?.hash.slice(0, 7) ?? '']
    : selection
      ? [selection.commit.parents[0]?.slice(0, 7) ?? '∅', selection.commit.hash.slice(0, 7)]
      : undefined
  const diffChange = files?.find((f) => f.path === filePath)

  return (
    <div className="history-view">
      <div className="history-bar">
        <input
          className="history-filter"
          type="search"
          value={query}
          placeholder={t.git.filterCommits}
          aria-label={t.git.filterCommits}
          onChange={(e) => setQuery(e.target.value)}
        />
        {preview && (
          <span className={`history-merge${preview.conflicts.length ? ' conflict' : ''}`} title={preview.conflicts.join('\n')}>
            {preview.conflicts.length ? `⚠ ${t.git.mergeConflicts(preview.conflicts.length, preview.base)}` : `✓ ${t.git.mergeClean(preview.base)}`}
          </span>
        )}
      </div>
      {notice && (
        <p className={`editor-notice${notice.error ? ' error' : ''}`} role={notice.error ? 'alert' : 'status'}>
          {notice.text}
        </p>
      )}

      <ol className="history" aria-label={t.git.history}>
        {!needle && Boolean(git?.changes.length) && (
          <li className="history-row pending">
            <svg className="graph-lines" width={width} height={ROW_HEIGHT} aria-hidden>
              <path d={`M${xOf(headLane)} ${MID} L${xOf(headLane)} ${ROW_HEIGHT}`} stroke={colorOf(headLane)} strokeDasharray="3 3" />
              <circle cx={xOf(headLane)} cy={MID} r={4.5} stroke={colorOf(headLane)} strokeDasharray="3 2" />
            </svg>
            <button className="link" onClick={onShowChanges}>
              {t.git.uncommitted(git!.changes.length)}
            </button>
          </li>
        )}
        {!shown.length && <li className="tree-empty">{t.git.noMatch}</li>}
        {shown.map((row) => {
          const { commit } = row
          const turn = turnOf(commit)
          const picked = selection?.commit.hash === commit.hash
          return (
            <li
              key={commit.hash}
              className={`history-row${commit.head ? ' head' : ''}${picked ? ' selected' : ''}${anyMine && !commit.mine ? ' other' : ''}${commit.mine ? ' mine' : ''}`}
              title={`${commit.author} · ${new Date(commit.time * 1000).toLocaleString()}`}
              onClick={() => setSelection(picked && !selection?.compare ? null : { commit, compare: false, branching: false })}
              onContextMenu={(e) => void openMenu(e, commit)}
            >
              {needle ? <span className="graph-lines" style={{ width: 0 }} /> : <Lines row={row} width={width} />}
              {commit.refs.map((ref) => (
                <span key={ref} className={`history-ref${ref.includes('/') ? ' remote' : ''}`}>
                  {ref}
                </span>
              ))}
              <span className="history-subject">{commit.subject}</span>
              {turn && (
                <span className="history-badge agent" title={t.git.byAgentHint(`$${turn.costUsd.toFixed(2)}`)}>
                  {t.git.byAgent} · ${turn.costUsd.toFixed(2)}
                </span>
              )}
              {commit.unpushed && <span className="history-badge" title={t.git.unpushedHint}>↑</span>}
              {commit.incoming && <span className="history-badge" title={t.git.incomingHint}>↓</span>}
              <span className="history-meta">{ago(commit.time, now)}</span>
              <code className="history-hash">{commit.hash.slice(0, 7)}</code>
            </li>
          )
        })}
        {log.more && !needle && (
          <li className="history-more">
            <button onClick={() => setLimit((n) => n + PAGE)}>{t.git.loadMore}</button>
          </li>
        )}
      </ol>

      {selection && (
        <section className="commit-detail">
          <header className="commit-detail-head">
            <strong className="commit-detail-title">{selection.compare ? t.git.comparing(selection.commit.hash.slice(0, 7)) : selection.commit.subject}</strong>
            <span className="history-meta">
              {selection.commit.author} · {new Date(selection.commit.time * 1000).toLocaleString()}
            </span>
            <button className="link" onClick={() => setSelection(null)}>
              {t.git.closeDetail}
            </button>
          </header>
          {selection.branching ? (
            <form
              className="commit-branch"
              onSubmit={(e) => {
                e.preventDefault()
                void run(selection.commit, 'branch', branchName.trim())
              }}
            >
              <input autoFocus value={branchName} placeholder={t.git.branchName} aria-label={t.git.branchName} onChange={(e) => setBranchName(e.target.value)} />
              <button className="primary" disabled={!branchName.trim()}>
                {t.git.createBranch}
              </button>
            </form>
          ) : (
            <div className="commit-detail-body">
              <div className="commit-files">
                {files && <p className="tree-empty">{files.length ? t.git.commitFiles(files.length) : t.git.noCommitFiles}</p>}
                {files?.map((change) => (
                  <button
                    key={change.path}
                    className={`tree-row${change.path === filePath ? ' selected' : ''}`}
                    title={change.path}
                    onClick={() => setFilePath(change.path)}
                  >
                    <span className={`change-mark ${change.kind}`}>{KIND_MARK[change.kind]}</span>
                    <span className={`tree-name ${change.kind}`}>{change.path.slice(change.path.lastIndexOf('/') + 1)}</span>
                    <span className="change-dir">{change.path.includes('/') ? change.path.slice(0, change.path.lastIndexOf('/')) : ''}</span>
                  </button>
                ))}
              </div>
              <div className="commit-diff">
                {diffChange && diffCommits && (
                  <DiffView id={id} path={diffChange.path} kind={diffChange.kind} revision={diffCommits.after} commits={diffCommits} labels={diffLabels} />
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
