import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import Markdown from 'react-markdown'
import { atEdge, sentMessages, START, stepHistory, type HistoryCursor } from '../../shared/history'
import { issuePrompt } from '../../shared/linear'
import {
  PERMISSION_MODES,
  type BackgroundTask,
  type Feature,
  type GitStatus,
  type PermissionDecision,
  type Project,
  type StoredEvent
} from '../../shared/types'
import { AttachButton, DraftAttachments, SentAttachments } from './Attachments'
import { ContextMeter } from './ContextMeter'
import { ConversationSearch } from './ConversationSearch'
import { loadDraft, saveDraft } from './drafts'
import { GitActions } from './GitActions'
import { openContextMenu } from './contextMenu'
import { Icon } from './ui/Icon'
import { useLang, useT } from './i18n'
import { LinkIssueDialog } from './LinkIssueDialog'
import { ModelPicker } from './ModelPicker'
import { EffortPicker } from './EffortPicker'
import { CommandMenu } from './CommandMenu'
import { commandQuery, matchCommands, mergeCommands, modelFromArgument, parseSlashCommand, type SlashCommandInfo } from '../../shared/slashCommands'
import { cleanError } from './NewFeatureDialog'
import { PermissionCard } from './PermissionCard'
import { attachTerminal, closeTerminal, fitTerminal, openTerminal, useCliTab, type TerminalTab } from './terminalStore'
import { TemplateChips } from './TemplatesDialog'
import { buildTranscript, groupTools, toolState, toolSummary, type Block, type Item, type ToolItem, type Todo } from './transcript'
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
  onShowChanges,
  linearConnected,
  linking,
  onLinking,
  onContinue
}: Props) {
  const t = useT()
  const lang = useLang()
  const { items, todos } = useMemo(() => buildTranscript(events, t, lang), [events, t, lang])
  const blocks: Block[] = useMemo(() => groupTools(items), [items])
  // What was typed here and not sent comes back when the agent does.
  const [draft, setDraft] = useState(() => loadDraft(feature.id))
  const attachments = useAttachments()
  const box = useRef<HTMLTextAreaElement>(null)
  const history = useMemo(() => sentMessages(events), [events])
  const cursor = useRef<HistoryCursor>(START)
  /** Caret position to restore once a message recalled from the history is on screen. */
  const caretAtEnd = useRef(false)
  const [finding, setFinding] = useState(false)
  const [commands, setCommands] = useState<SlashCommandInfo[] | null>(null)
  const [commandIndex, setCommandIndex] = useState(0)
  const query = commandQuery(draft)
  const suggestions = useMemo(() => (query === null ? [] : matchCommands(mergeCommands(commands), query)), [commands, query])
  // The session lists its own commands, skills included, once its process is up.
  useEffect(() => {
    if (query === null) return
    let stale = false
    window.api.slashCommands(feature.id).then((list) => !stale && list && setCommands(list), () => {})
    return () => {
      stale = true
    }
  }, [feature.id, query === null])
  useEffect(() => setCommandIndex(0), [query])
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
  /** Scrolled away from the newest output: offers a way back. */
  const [away, setAway] = useState(false)

  // Follow new output only while the user is already at the bottom.
  useEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [items, stream])

  const busy = feature.status === 'working' || feature.status === 'waiting' || feature.status === 'queued'

  function submit() {
    const text = draft.trim()
    if (!text && !attachments.drafts.length) return
    // The model is this app's to switch: the agent's process would change it without the app knowing.
    const command = parseSlashCommand(text)
    if (command?.name === 'model' && !attachments.drafts.length) {
      const model = modelFromArgument(command.args)
      if (model) {
        setDraft('')
        void window.api.setAgentModel(feature.id, model)
        return
      }
    }
    setDraft('')
    cursor.current = START
    attachments.clear()
    pinned.current = true
    void window.api.send(feature.id, text, toMessageAttachments(attachments.drafts))
  }

  const stop = () => void window.api.interrupt(feature.id)

  function pickCommand(command: SlashCommandInfo) {
    cursor.current = START
    caretAtEnd.current = true
    setDraft(`/${command.name} `)
    box.current?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length && !e.nativeEvent.isComposing) {
      const last = suggestions.length - 1
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setCommandIndex((i) => (e.key === 'ArrowDown' ? (i >= last ? 0 : i + 1) : i <= 0 ? last : i - 1))
        return
      }
      // Enter sends a command typed in full; it completes one that is only started.
      const typed = suggestions[commandIndex] ?? suggestions[0]
      if ((e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && query !== typed.name)) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        pickCommand(typed)
        return
      }
    }
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

  const cliTab = useCliTab(feature.id)
  const [cliError, setCliError] = useState<string | null>(null)
  const working = feature.status === 'working' || feature.status === 'waiting'

  function swapToCli() {
    setCliError(null)
    openTerminal({ featureId: feature.id }, undefined, true).catch((err) => setCliError(t.terminal.failed(cleanError(err))))
  }

  const respond = (requestId: string, decision: PermissionDecision) =>
    void window.api.respondPermission(feature.id, requestId, decision)

  return (
    <div className="feature">
      <header className="feature-head">
        <div className="feature-head-main">
          <div className="feature-title">
            <h1>{feature.title}</h1>
            <span className={`status-pill ${feature.status}`}>
              <span className={`dot ${feature.status}`} />
              {t.status[feature.status]}
            </span>
          </div>
          <p className="feature-meta">
            {project?.name}
            <span className="sep">/</span>
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
          </p>
        </div>
        <div className="view-switch" role="group" aria-label={t.feature.viewSwitch}>
          <button className={cliTab ? '' : 'selected'} aria-pressed={!cliTab} onClick={() => cliTab && closeTerminal(cliTab.info.id)}>
            {t.feature.viewBaton}
          </button>
          <button
            className={cliTab ? 'selected' : ''}
            aria-pressed={Boolean(cliTab)}
            disabled={!cliTab && (!feature.sessionId || working)}
            title={!cliTab && (!feature.sessionId || working) ? t.feature.viewCliUnavailable : t.feature.viewCliHint}
            onClick={() => !cliTab && swapToCli()}
          >
            {t.feature.viewCli}
          </button>
        </div>
        <div className="feature-stats">
          <ContextMeter feature={feature} onContinue={onContinue} />
          <div className="stat">
            <span className="stat-label">{t.feature.cost}</span>
            <span className="stat-value num">≈ ${feature.costUsd.toFixed(2)}</span>
          </div>
        </div>
      </header>

      {cliError && <p className="terminal-error">{cliError}</p>}
      {cliTab ? (
        <CliView tab={cliTab} />
      ) : (
        <>
        {todos.length > 0 && <PlanBanner todos={todos} />}

        {finding && <ConversationSearch scroller={scroller} revision={searchRevision} onClose={() => setFinding(false)} />}

        <div
          className="transcript"
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
            setAway(!pinned.current)
          }}
          role="log"
          aria-label={t.feature.conversation}
        >
          <div className="transcript-inner">
            {items.length === 0 && !stream && <p className="transcript-empty">{t.feature.sendFirst}</p>}
            {blocks.map((block) =>
              block.type === 'tools' ? (
                <ToolCluster key={block.seq} tools={block.tools} />
              ) : (
                <TranscriptItem key={block.seq} item={block} featureId={feature.id} onRespond={respond} />
              )
            )}
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
          <div className="jump-anchor">
            {away && (
              <button
                className="jump-latest"
                onClick={() => {
                  const el = scroller.current
                  if (el) el.scrollTo({ top: el.scrollHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
                }}
              >
                <Icon name="chevron-down" size={12} /> {t.feature.jumpToLatest}
              </button>
            )}
          </div>
        </div>

        <footer className="composer" onDragOver={attachments.onDragOver} onDrop={attachments.onDrop}>
          {suggestions.length > 0 && <CommandMenu commands={suggestions} selected={commandIndex} onPick={pickCommand} />}
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
            <ModelPicker value={feature.agentModel} above onChange={(model) => void window.api.setAgentModel(feature.id, model)} />
            <span className="composer-modes-sep">{t.newFeature.effort}</span>
            <EffortPicker value={feature.agentEffort} above onChange={(effort) => void window.api.setAgentEffort(feature.id, effort)} />
          </div>
        </footer>
        </>
      )}

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

/** The conversation in the Claude Code CLI, which takes the place of the transcript and the message box. */
function CliView({ tab }: { tab: TerminalTab }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    attachTerminal(tab, el)
    const observer = new ResizeObserver(() => fitTerminal(tab))
    observer.observe(el)
    return () => {
      observer.disconnect()
      tab.el.remove()
    }
  }, [tab])

  return <div className="terminal-host cli-host" ref={host} />
}

/** Spinner, tick or cross: the state of a call without relying on color alone. */
function ToolGlyph({ tool }: { tool: ToolItem }) {
  const state = toolState(tool)
  return (
    <span className={`tool-glyph ${state}`} aria-hidden="true">
      {state === 'done' && <Icon name="check" size={11} />}
      {state === 'failed' && <Icon name="close" size={11} />}
    </span>
  )
}

/** Two or more tool calls in a row, folded to one line: what ran, and whether anything is running or failed. */
function ToolCluster({ tools }: { tools: ToolItem[] }) {
  const t = useT()
  const states = tools.map(toolState)
  const running = states.filter((s) => s === 'running').length
  const failed = states.filter((s) => s === 'failed').length
  const names = [...new Set(tools.map((x) => x.name))]
  return (
    <details className={`tool-cluster${failed ? ' failed' : ''}`}>
      <summary>
        <span className={`tool-glyph ${running ? 'running' : failed ? 'failed' : 'done'}`} aria-hidden="true">
          {!running && (failed ? <Icon name="close" size={11} /> : <Icon name="check" size={11} />)}
        </span>
        <span className="tool-cluster-count">{t.feature.toolCalls(tools.length)}</span>
        <span className="tool-summary">{names.join(', ')}</span>
        {running > 0 && <span className="tool-state">{t.feature.toolsRunning(running)}</span>}
        {failed > 0 && <span className="tool-state failed">{t.feature.toolsFailed(failed)}</span>}
      </summary>
      <div className="tool-cluster-body">
        {tools.map((tool) => (
          <TranscriptItem key={tool.seq} item={tool} featureId="" onRespond={() => {}} />
        ))}
      </div>
    </details>
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
            <ToolGlyph tool={item} />
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
