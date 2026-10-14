import type { Dict, Lang } from '../../shared/i18n'
import { formatReset } from '../../shared/time'
import type { FileRef, ImageRef, Notice, Question, StoredEvent } from '../../shared/types'

export type Item =
  | { type: 'user'; seq: number; text: string; images: ImageRef[]; files: FileRef[] }
  | { type: 'assistant'; seq: number; text: string }
  | {
      type: 'tool'
      seq: number
      name: string
      input: Record<string, unknown>
      result?: { content: string; isError: boolean }
      /** The turn ended without this call ever reporting a result. */
      orphaned?: boolean
    }
  | {
      type: 'permission'
      seq: number
      requestId: string
      toolName: string
      input: Record<string, unknown>
      canAlwaysAllow: boolean
      reason?: string
      resolved?: 'allow' | 'deny'
    }
  | { type: 'turn_end'; seq: number; costUsd: number; interrupted: boolean; error?: string }
  | { type: 'note'; seq: number; text: string; tone: 'info' | 'warn' | 'error' }

export interface Todo {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

export interface Transcript {
  items: Item[]
  /** Latest task list published by the agent, if any. */
  todos: Todo[]
}

function noticeText(notice: Notice, t: Dict): string {
  switch (notice.code) {
    case 'app_closed':
      return t.notice.appClosed
    case 'linear_moved':
      return t.notice.linearMoved(notice.identifier, notice.state)
    case 'linear_failed':
      return t.notice.linearFailed(notice.identifier, notice.reason)
    case 'context_compacted':
      return t.notice.contextCompacted(notice.preTokens, notice.postTokens)
    case 'queued':
      return t.notice.queued(notice.maxRunning)
  }
}

/** Folds the flat journal into display items, pairing results and answers with what they belong to. */
export function buildTranscript(events: StoredEvent[], t: Dict, lang: Lang): Transcript {
  const items: Item[] = []
  const tools = new Map<string, Extract<Item, { type: 'tool' }>>()
  const permissions = new Map<string, Extract<Item, { type: 'permission' }>>()
  let todos: Todo[] = []
  /** Reset time of the usage window already warned about, to warn once per window. */
  let warnedReset: number | undefined | null = null
  const orphanOpenTools = () => {
    for (const tool of tools.values()) if (!tool.result) tool.orphaned = true
  }

  for (const { seq, event: ev } of events) {
    switch (ev.kind) {
      case 'user':
        items.push({ type: 'user', seq, text: ev.text, images: ev.images ?? [], files: ev.files ?? [] })
        break
      case 'assistant_text':
        items.push({ type: 'assistant', seq, text: ev.text })
        break
      case 'tool_use': {
        if (ev.name === 'TodoWrite' && Array.isArray(ev.input.todos)) {
          todos = ev.input.todos as Todo[]
          break
        }
        // The question card that follows already shows everything this call contains.
        if (ev.name === 'AskUserQuestion') break
        const item: Extract<Item, { type: 'tool' }> = { type: 'tool', seq, name: ev.name, input: ev.input }
        tools.set(ev.toolUseId, item)
        items.push(item)
        break
      }
      case 'tool_result': {
        const tool = tools.get(ev.toolUseId)
        if (tool) tool.result = { content: ev.content, isError: ev.isError }
        break
      }
      case 'permission_request': {
        const item: Extract<Item, { type: 'permission' }> = {
          type: 'permission',
          seq,
          requestId: ev.requestId,
          toolName: ev.toolName,
          input: ev.input,
          canAlwaysAllow: ev.canAlwaysAllow,
          reason: ev.reason
        }
        permissions.set(ev.requestId, item)
        items.push(item)
        break
      }
      case 'permission_resolved': {
        const permission = permissions.get(ev.requestId)
        if (permission) permission.resolved = ev.behavior
        break
      }
      case 'result':
        orphanOpenTools()
        items.push({
          type: 'turn_end',
          seq,
          costUsd: ev.turnCostUsd,
          interrupted: ev.interrupted,
          ...(ev.isError && !ev.interrupted && ev.text ? { error: ev.text } : {})
        })
        break
      case 'rate_limit':
        if (ev.status === 'rejected') {
          items.push({ type: 'note', seq, tone: 'error', text: t.notice.limitReached(formatReset(ev.resetsAt, lang)) })
        } else if (ev.status === 'allowed_warning' && warnedReset !== ev.resetsAt) {
          warnedReset = ev.resetsAt
          items.push({ type: 'note', seq, tone: 'warn', text: t.notice.limitNear(formatReset(ev.resetsAt, lang)) })
        }
        break
      case 'error':
        items.push({ type: 'note', seq, tone: 'error', text: ev.message })
        break
      case 'notice':
        // Notices mark a turn cut short by the app closing.
        orphanOpenTools()
        items.push({ type: 'note', seq, tone: 'info', text: ev.notice ? noticeText(ev.notice, t) : (ev.text ?? '') })
        break
    }
  }
  return { items, todos }
}

/** One-line description of what a tool call is about. */
export function toolSummary(input: Record<string, unknown>): string {
  for (const key of ['file_path', 'command', 'pattern', 'url', 'query', 'description', 'path', 'skill']) {
    const value = input[key]
    if (typeof value === 'string' && value) return value.split('\n')[0]
  }
  return ''
}

export function asQuestions(input: Record<string, unknown>): Question[] {
  return Array.isArray(input.questions) ? (input.questions as Question[]) : []
}
