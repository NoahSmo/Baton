import { useState } from 'react'
import type { PermissionDecision } from '../../shared/types'
import { useT } from './i18n'
import { asQuestions, toolSummary, type Item } from './transcript'

interface Props {
  item: Extract<Item, { type: 'permission' }>
  onRespond(decision: PermissionDecision): void
}

export function PermissionCard({ item, onRespond }: Props) {
  const t = useT()
  const questions = item.toolName === 'AskUserQuestion' ? asQuestions(item.input) : []

  if (item.resolved) {
    return (
      <div className="permission-done">
        {questions.length ? t.permission.question : item.toolName} ·{' '}
        {item.resolved === 'allow' ? (questions.length ? t.permission.answered : t.permission.allowed) : t.permission.denied}
      </div>
    )
  }

  if (questions.length) return <QuestionCard item={item} onRespond={onRespond} />

  const summary = toolSummary(item.input)
  return (
    <div className="card">
      <p className="card-title">
        {t.permission.allowBefore}
        <strong>{item.toolName}</strong>
        {t.permission.allowAfter}
      </p>
      {item.reason && <p className="card-reason">{item.reason}</p>}
      <pre>{summary || JSON.stringify(item.input, null, 2)}</pre>
      <div className="card-actions">
        <button className="primary" onClick={() => onRespond({ behavior: 'allow' })}>
          {t.permission.allow}
        </button>
        {item.canAlwaysAllow && (
          <button onClick={() => onRespond({ behavior: 'allow', always: true })}>{t.permission.always}</button>
        )}
        <button onClick={() => onRespond({ behavior: 'deny' })}>{t.permission.deny}</button>
      </div>
    </div>
  )
}

function QuestionCard({ item, onRespond }: Props) {
  const t = useT()
  const questions = asQuestions(item.input)
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [other, setOther] = useState<Record<string, string>>({})

  function toggle(question: string, label: string, multi: boolean) {
    setPicked((all) => {
      const cur = all[question] ?? []
      if (!multi) return { ...all, [question]: [label] }
      return { ...all, [question]: cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label] }
    })
    if (!multi) setOther((all) => ({ ...all, [question]: '' }))
  }

  const answerFor = (question: string) =>
    [...(picked[question] ?? []), ...(other[question]?.trim() ? [other[question].trim()] : [])].join(', ')

  const complete = questions.every((q) => answerFor(q.question))

  return (
    <div className="card">
      {questions.map((q) => (
        <div key={q.question} className="question">
          <p className="card-title">{q.question}</p>
          <div className="options">
            {q.options.map((o) => (
              <button
                key={o.label}
                className={`option${picked[q.question]?.includes(o.label) ? ' selected' : ''}`}
                onClick={() => toggle(q.question, o.label, Boolean(q.multiSelect))}
              >
                <span className="option-label">{o.label}</span>
                {o.description && <span className="option-desc">{o.description}</span>}
              </button>
            ))}
          </div>
          <input
            value={other[q.question] ?? ''}
            onChange={(e) => {
              const value = e.target.value
              setOther((all) => ({ ...all, [q.question]: value }))
              if (!q.multiSelect && value) setPicked((all) => ({ ...all, [q.question]: [] }))
            }}
            placeholder={t.permission.other}
          />
        </div>
      ))}
      <div className="card-actions">
        <button
          className="primary"
          disabled={!complete}
          onClick={() =>
            onRespond({
              behavior: 'allow',
              answers: Object.fromEntries(questions.map((q) => [q.question, answerFor(q.question)]))
            })
          }
        >
          {t.permission.sendAnswer}
        </button>
        <button onClick={() => onRespond({ behavior: 'deny', message: 'The user dismissed the question.' })}>
          {t.permission.dismiss}
        </button>
      </div>
    </div>
  )
}
