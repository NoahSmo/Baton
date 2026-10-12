import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import Markdown from 'react-markdown'
import type { Feature, PermissionDecision, Project, StoredEvent } from '../../shared/types'
import { openContextMenu } from './contextMenu'
import { useLang, useT } from './i18n'
import { PermissionCard } from './PermissionCard'
import { buildTranscript, toolSummary, type Item, type Todo } from './transcript'

interface Props {
  feature: Feature
  project: Project | undefined
  events: StoredEvent[]
  stream: string
}

export function FeatureView({ feature, project, events, stream }: Props) {
  const t = useT()
  const lang = useLang()
  const { items, todos } = useMemo(() => buildTranscript(events, t, lang), [events, t, lang])
  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  // Follow new output only while the user is already at the bottom.
  useEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [items, stream])

  const busy = feature.status === 'working' || feature.status === 'waiting'

  function submit() {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    pinned.current = true
    void window.api.send(feature.id, text)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
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
            <code>{feature.branch}</code>
            {feature.linear && (
              <>
                <span className="sep">·</span>
                <a href={feature.linear.url} target="_blank" rel="noreferrer">
                  {feature.linear.identifier}
                </a>
              </>
            )}
            {feature.costUsd > 0 && (
              <>
                <span className="sep">·</span>
                <span className="num">${feature.costUsd.toFixed(2)}</span>
              </>
            )}
          </p>
        </div>
        <div className="feature-actions">
          {busy && <button onClick={() => void window.api.interrupt(feature.id)}>{t.feature.stop}</button>}
          <button onClick={() => void window.api.reveal(feature.id)}>{t.feature.openFolder}</button>
          <button className="danger" onClick={() => void window.api.removeFeature(feature.id)}>
            {t.common.delete}
          </button>
        </div>
      </header>

      {todos.length > 0 && <PlanBanner todos={todos} />}

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
            <TranscriptItem key={item.seq} item={item} onRespond={respond} />
          ))}
          {stream && (
            <div className="msg assistant">
              <Markdown>{stream}</Markdown>
            </div>
          )}
          {feature.status === 'working' && !stream && <div className="thinking">{t.feature.working}</div>}
        </div>
      </div>

      <footer className="composer">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={Math.min(8, Math.max(1, draft.split('\n').length))}
          placeholder={busy ? t.feature.queuePlaceholder : t.feature.messagePlaceholder}
        />
        <button className="primary" onClick={submit} disabled={!draft.trim()}>
          {t.feature.send}
        </button>
      </footer>
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
  onRespond
}: {
  item: Item
  onRespond(requestId: string, decision: PermissionDecision): void
}) {
  const t = useT()
  switch (item.type) {
    case 'user':
      return (
        <div className="msg user" onContextMenu={(e) => copyMenu(e, [{ label: 'message', text: item.text }])}>
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
