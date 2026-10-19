import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import Markdown from 'react-markdown'
import { kTokens } from '../../shared/i18n'
import { atEdge, sentMessages, START, stepHistory, type HistoryCursor } from '../../shared/history'
import { issuePrompt } from '../../shared/linear'
import {
  AGENT_MODELS,
  PERMISSION_MODES,
  type BackgroundTask,
  type Feature,
  type GitStatus,
  type PermissionDecision,
  type Project,
  type StoredEvent
} from '../../shared/types'
import { AttachButton, DraftAttachments, SentAttachments } from './Attachments'
import { BranchPicker } from './BranchPicker'
import { ConversationSearch } from './ConversationSearch'
import { loadDraft, saveDraft } from './drafts'
import { GitActions } from './GitActions'
import { openContextMenu } from './contextMenu'
import { useLang, useT } from './i18n'
import { LinkIssueDialog } from './LinkIssueDialog'
import { PermissionCard } from './PermissionCard'
import { TemplateChips } from './TemplatesDialog'
import { buildTranscript, toolSummary, type Item, type Todo } from './transcript'
import { toMessageAttachments, useAttachments } from './useAttachments'

interface Props {
  feature: Feature
  project: Project | undefined
  events: StoredEvent[]
  stream: string
  /** Work still running in the background, which a finished turn does not mean is over. */
  background: BackgroundTask[]
  /** Null until the worktree's status has been read. */
  git: GitStatus | null
  editorOpen: boolean
  terminalOpen: boolean
  onToggleEditor(): void
  onToggleTerminal(): void
  /** Opens the editor on the list of changed files. */
  onShowChanges(): void
  linearConnected: boolean
  /** The dialog linking this agent to an issue is open. */
  linking: boolean
  onLinking(open: boolean): void
  /** Opens the dialog starting a new agent from this one's work. */
  onContinue(): void
}

export function FeatureView({
  feature,
  project,
  events,
  stream,
  background,
  git,
  editorOpen,
  terminalOpen,
  onToggleEditor,
  onToggleTerminal,
  onShowChanges,
  linearConnected,
  linking,
  onLinking,
  onContinue
}: Props) {
  const t = useT()
  const lang = useLang()
  const { items, todos } = useMemo(() => buildTranscript(events, t, lang), [events, t, lang])
  // What was typed here and not sent comes back when the agent does.
  const [draft, setDraft] = useState(() => loadDraft(feature.id))
  const attachments = useAttachments()
  const box = useRef<HTMLTextAreaElement>(null)
  const history = useMemo(() => sentMessages(events), [events])
  const cursor = useRef<HistoryCursor>(START)
  /** Caret position to restore once a message recalled from the history is on screen. */
  const caretAtEnd = useRef(false)
  const [finding, setFinding] = useState(false)
  /** Changes with the transcript, to find the matches again; the stream is not part of `items`. */
  const searchRevision = useMemo(() => ({}), [items, stream])
  useEffect(() => saveDraft(feature.id, draft), [feature.id, draft])
  useLayoutEffect(() => {
    if (!caretAtEnd.current || !box.current) return
    caretAtEnd.current = false
    box.current.setSelectionRange(draft.length, draft.length)
  }, [draft])
  useEffect(() => {
    const open = () => setFinding(true)
    window.addEventListener('baton:find', open)
    return () => window.removeEventListener('baton:find', open)
  }, [])
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  // Follow new output only while the user is already at the bottom.
  useEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [items, stream])

  const busy = feature.status === 'working' || feature.status === 'waiting' || feature.status === 'queued'

  function submit() {
    const text = draft.trim()
    if (!text && !attachments.drafts.length) return
    setDraft('')
    cursor.current = START
    attachments.clear()
    pinned.current = true
    void window.api.send(feature.id, text, toMessageAttachments(attachments.drafts))
  }

  const stop = () => void window.api.interrupt(feature.id)

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl+C keeps copying when text is selected.
    const { selectionStart, selectionEnd } = e.currentTarget
    const ctrlC = e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'c' && selectionStart === selectionEnd
    if ((e.key === 'Escape' || ctrlC) && busy) {
      e.preventDefault()
      stop()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
      return
    }
    // ↑ and ↓ leaf through earlier messages, from an empty box or the start of the text.
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !e.nativeEvent.isComposing) {
      const direction = e.key === 'ArrowUp' ? 'up' : 'down'
      const browsing = cursor.current.index !== null
      const start = draft === '' || (selectionStart === 0 && selectionEnd === 0)
      if (!(browsing ? atEdge(draft, selectionStart, direction) : direction === 'up' && start)) return
      const step = stepHistory(cursor.current, history, draft, direction)
      if (!step) return
      e.preventDefault()
      cursor.current = step.cursor
      caretAtEnd.current = true
      setDraft(step.text)
    }
  }

  const respond = (requestId: string, decision: PermissionDecision) =>
    void window.api.respondPermission(feature.id, requestId, decision)

  return (
    <div className="feature">
      <header className="feature-head">
        <div className="feature-head-main">
          <h1>{feature.title}</h1>
          <p className="feature-meta">
            <span className={`dot ${feature.status}`} />
            {t.status[feature.status]}
            <span className="sep">·</span>
            {project?.name}
            <span className="sep">·</span>
            {(feature.branch || git) && <BranchPicker feature={feature} git={git} />}
            {git && git.ahead > 0 && (
              <span className="num" title={t.git.ahead(git.ahead, git.upstream ?? '')}>
                ↑{git.ahead}
              </span>
            )}
            {git && git.behind > 0 && (
              <span className="num" title={t.git.behind(git.behind, git.upstream ?? '')}>
                ↓{git.behind}
              </span>
            )}
            {git && git.changes.length > 0 && (
              <>
                <span className="sep">·</span>
                <button className="link" onClick={onShowChanges}>
                  {t.git.changed(git.changes.length)}
                </button>
              </>
            )}
            <GitActions feature={feature} git={git} />
            {feature.linear ? (
              <>
                <span className="sep">·</span>
                <a href={feature.linear.url} target="_blank" rel="noreferrer">
                  {feature.linear.identifier}
                </a>
              </>
            ) : (
              linearConnected && (
                <>
                  <span className="sep">·</span>
                  <button className="link" onClick={() => onLinking(true)}>
                    {t.feature.linkIssue}
                  </button>
                </>
              )
            )}
            {feature.costUsd > 0 && (
              <>
                <span className="sep">·</span>
                <span className="num">${feature.costUsd.toFixed(2)}</span>
              </>
            )}
            {feature.contextTokens > 0 && (
              <>
                <span className="sep">·</span>
                <span className={`num${feature.contextTokens > 100_000 ? ' heavy' : ''}`} title={t.feature.contextSize}>
                  {kTokens(feature.contextTokens)} ctx
                </span>
                {feature.contextTokens > 100_000 && feature.sessionId && (
                  <button className="link" title={t.handoff.heavy} onClick={onContinue}>
                    {t.handoff.button}
                  </button>
                )}
              </>
            )}
          </p>
        </div>
        <div className="feature-actions">
          {busy && <button onClick={stop}>{t.feature.stop}</button>}
          <button
            className={editorOpen ? 'toggled' : ''}
            aria-pressed={editorOpen}
            title={t.feature.editor}
            aria-label={t.feature.editor}
            onClick={onToggleEditor}
          >
            {'</>'}
          </button>
          <button
            className={terminalOpen ? 'toggled' : ''}
            aria-pressed={terminalOpen}
            title={t.feature.toggleTerminalHint}
            onClick={onToggleTerminal}
          >
            {t.feature.terminal}
          </button>
          <button onClick={() => void window.api.reveal(feature.id)}>{t.feature.openFolder}</button>
          <button className="danger" onClick={() => void window.api.removeFeature(feature.id)}>
            {t.common.delete}
          </button>
        </div>
      </header>

      {todos.length > 0 && <PlanBanner todos={todos} />}

      {finding && <ConversationSearch scroller={scroller} revision={searchRevision} onClose={() => setFinding(false)} />}

      <div
        className="transcript"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
      >
        <div className="transcript-inner">
          {items.length === 0 && !stream && <p className="transcript-empty">{t.feature.sendFirst}</p>}
          {items.map((item) => (
            <TranscriptItem key={item.seq} item={item} featureId={feature.id} onRespond={respond} />
          ))}
          {stream && (
            <div className="msg assistant">
              <Markdown>{stream}</Markdown>
            </div>
          )}
          {feature.status === 'working' && !stream && <div className="thinking">{t.feature.working}</div>}
          {background.length > 0 && (
            <div className="background-tasks">
              <div className="background-title">{t.feature.backgroundRunning(background.length)}</div>
              {background.map((task) => (
                <div key={task.id} className="background-task">
                  <span className="background-dot" />
                  <span className="background-kind">{task.kind}</span>
                  <span className="background-desc">{task.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className="composer" onDragOver={attachments.onDragOver} onDrop={attachments.onDrop}>
        <DraftAttachments drafts={attachments.drafts} rejected={attachments.rejected} onRemove={attachments.remove} />
        {project && (
          <TemplateChips
            templates={project.templates}
            onPick={(text) => {
              cursor.current = START
              caretAtEnd.current = true
              setDraft((current) => (current.trim() ? `${current.trimEnd()}\n${text}` : text))
              box.current?.focus()
            }}
          />
        )}
        <div className="composer-row">
          <AttachButton onPick={(files) => void attachments.add(files)} />
          <textarea
            ref={box}
            value={draft}
            onChange={(e) => {
              cursor.current = START
              setDraft(e.target.value)
            }}
            onKeyDown={onKeyDown}
            onPaste={attachments.onPaste}
            rows={Math.min(8, Math.max(1, draft.split('\n').length))}
            placeholder={busy ? t.feature.queuePlaceholder : t.feature.messagePlaceholder}
          />
          {busy && (
            <button className="danger" onClick={stop} title={t.feature.stopHint}>
              {t.feature.stop}
            </button>
          )}
          <button className="primary" onClick={submit} disabled={!draft.trim() && !attachments.drafts.length}>
            {t.feature.send}
          </button>
        </div>
        {/* Applies at once, to the turn in progress too. */}
        <div className="composer-modes" role="group" aria-label={t.newFeature.permissions}>
          <span>{t.newFeature.permissions}</span>
          {PERMISSION_MODES.map((mode) => (
            <button
              key={mode}
              className={`filter ${mode}${feature.permissionMode === mode ? ' selected' : ''}`}
              aria-pressed={feature.permissionMode === mode}
              title={t.modes[mode].hint}
              onClick={() => void window.api.setPermissionMode(feature.id, mode)}
            >
              {t.modes[mode].label}
            </button>
          ))}
          <span className="composer-modes-sep">{t.newFeature.model}</span>
          {AGENT_MODELS.map((model) => (
            <button
              key={model}
              className={`filter${feature.agentModel === model ? ' selected' : ''}`}
              aria-pressed={feature.agentModel === model}
              title={t.models[model].hint}
              onClick={() => void window.api.setAgentModel(feature.id, model)}
            >
              {t.models[model].label}
            </button>
          ))}
        </div>
      </footer>

      {linking && project && (
        <LinkIssueDialog
          feature={feature}
          project={project}
          onClose={() => onLinking(false)}
          onLinked={(issue) => {
            onLinking(false)
            // The agent knows nothing of the issue yet: its text is ready to send, never sent for the user.
            setDraft((current) => current || issuePrompt(issue))
          }}
        />
      )}
    </div>
  )
}

function PlanBanner({ todos }: { todos: Todo[] }) {
  const t = useT()
  const done = todos.filter((t) => t.status === 'completed').length
  const current = todos.find((t) => t.status === 'in_progress')
  return (
    <details className="plan">
      <summary>
        <span className="plan-bar">
          <span style={{ width: `${(done / todos.length) * 100}%` }} />
        </span>
        <span className="num">
          {done}/{todos.length}
        </span>
        <span className="plan-current">{current ? (current.activeForm ?? current.content) : t.feature.plan}</span>
      </summary>
      <ul>
        {todos.map((t, i) => (
          <li key={i} className={t.status}>
            {t.content}
          </li>
        ))}
      </ul>
    </details>
  )
}

/** Opens a copy menu for a transcript block, unless the user is right-clicking their own selection. */
function copyMenu(e: MouseEvent, entries: { label: 'message' | 'input' | 'output'; text: string }[]) {
  if (window.getSelection()?.toString()) return
  void openContextMenu(e, { kind: 'text', entries })
}

function TranscriptItem({
  item,
  featureId,
  onRespond
}: {
  item: Item
  featureId: string
  onRespond(requestId: string, decision: PermissionDecision): void
}) {
  const t = useT()
  switch (item.type) {
    case 'user':
      return (
        <div className="msg user" onContextMenu={(e) => copyMenu(e, [{ label: 'message', text: item.text }])}>
          <SentAttachments featureId={featureId} images={item.images} files={item.files} />
          {item.text}
        </div>
      )
    case 'assistant':
      return (
        <div className="msg assistant" onContextMenu={(e) => copyMenu(e, [{ label: 'message', text: item.text }])}>
          <Markdown>{item.text}</Markdown>
        </div>
      )
    case 'tool':
      return (
        <details
          className={`tool${item.result?.isError ? ' failed' : ''}`}
          onContextMenu={(e) =>
            copyMenu(e, [
              { label: 'input', text: toolSummary(item.input) || JSON.stringify(item.input, null, 2) },
              { label: 'output', text: item.result?.content ?? '' }
            ])
          }
        >
          <summary>
            <span className="tool-name">{item.name}</span>
            <span className="tool-summary">{toolSummary(item.input)}</span>
            {!item.result && <span className="tool-state">{item.orphaned ? t.feature.noResult : t.feature.running}</span>}
            {item.result?.isError && <span className="tool-state">{t.feature.failed}</span>}
          </summary>
          <pre>{JSON.stringify(item.input, null, 2)}</pre>
          {item.result && <pre className="tool-result">{item.result.content || t.feature.noOutput}</pre>}
        </details>
      )
    case 'permission':
      return <PermissionCard item={item} onRespond={(decision) => onRespond(item.requestId, decision)} />
    case 'turn_end':
      return (
        <>
          {item.error && <div className="note error">{item.error}</div>}
          <div className="turn-end">
            <span>{item.interrupted ? t.feature.stopped : item.error ? t.feature.turnFailed : t.feature.turnFinished}</span>
            {item.costUsd > 0 && <span className="num">${item.costUsd.toFixed(3)}</span>}
          </div>
        </>
      )
    case 'note':
      return <div className={`note ${item.tone}`}>{item.text}</div>
  }
}
