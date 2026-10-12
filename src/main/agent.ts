import { randomUUID } from 'node:crypto'
import {
  query,
  type PermissionResult,
  type PermissionUpdate,
  type Query,
  type SDKMessage,
  type SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import type { PermissionDecision, PermissionMode, UiEvent } from '../shared/types'

const MAX_TOOL_RESULT_CHARS = 20_000

export type AgentOutput =
  | { type: 'event'; event: UiEvent }
  | { type: 'session'; sessionId: string; model: string }
  | { type: 'stream'; text: string }
  | { type: 'closed' }

export interface AgentOptions {
  cwd: string
  permissionMode: PermissionMode
  /** Session to resume; the conversation survives app restarts through it. */
  sessionId: string | null
  emit(out: AgentOutput): void
}

/** Unbounded queue feeding user messages to a long-lived query. */
class InputQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = []
  private waiter: ((r: IteratorResult<SDKUserMessage>) => void) | null = null
  private closed = false

  push(item: SDKUserMessage): void {
    if (this.waiter) {
      this.waiter({ value: item, done: false })
      this.waiter = null
    } else {
      this.items.push(item)
    }
  }

  close(): void {
    this.closed = true
    this.waiter?.({ value: undefined, done: true })
    this.waiter = null
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const item = this.items.shift()
        if (item) return Promise.resolve({ value: item, done: false })
        if (this.closed) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => (this.waiter = resolve))
      }
    }
  }
}

interface PendingPermission {
  input: Record<string, unknown>
  suggestions?: PermissionUpdate[]
  resolve(result: PermissionResult): void
}

function flattenContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return content == null ? '' : JSON.stringify(content)
  return content
    .map((block) => {
      if (block?.type === 'text') return block.text as string
      if (block?.type === 'image') return '[image]'
      return JSON.stringify(block)
    })
    .join('\n')
}

/**
 * One Claude Code process bound to one feature worktree. The process stays
 * alive across turns; it is started lazily on the first message and resumed
 * from the stored session id after a restart.
 */
export class AgentSession {
  private q: Query | null = null
  private input: InputQueue | null = null
  private pending = new Map<string, PendingPermission>()
  private sessionId: string | null
  private streamed = ''
  private interrupted = false
  /** Cost counters are cumulative per process, so a turn's cost is a delta. */
  private processCostUsd = 0

  constructor(private readonly opts: AgentOptions) {
    this.sessionId = opts.sessionId
  }

  /** Whether the agent is still blocked on an answer from the user. */
  get hasPendingRequests(): boolean {
    return this.pending.size > 0
  }

  get isRunning(): boolean {
    return this.q !== null
  }

  send(text: string): void {
    if (!this.q) this.start()
    this.interrupted = false
    this.input!.push({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null
    })
  }

  respond(requestId: string, decision: PermissionDecision): boolean {
    const pending = this.pending.get(requestId)
    if (!pending) return false
    this.pending.delete(requestId)
    if (decision.behavior === 'deny') {
      pending.resolve({ behavior: 'deny', message: decision.message || 'The user denied this action.' })
    } else {
      pending.resolve({
        behavior: 'allow',
        // AskUserQuestion is answered by allowing it with the answers filled in.
        updatedInput: decision.answers ? { ...pending.input, answers: decision.answers } : pending.input,
        ...(decision.always && pending.suggestions ? { updatedPermissions: pending.suggestions } : {})
      })
    }
    this.opts.emit({
      type: 'event',
      event: { kind: 'permission_resolved', requestId, behavior: decision.behavior }
    })
    return true
  }

  async interrupt(): Promise<void> {
    if (!this.q) return
    this.interrupted = true
    this.denyAllPending('Interrupted by the user.')
    await this.q.interrupt()
  }

  close(): void {
    this.denyAllPending('The session was closed.')
    this.input?.close()
    this.q?.close()
  }

  private start(): void {
    this.input = new InputQueue()
    this.processCostUsd = 0
    this.q = query({
      prompt: this.input,
      options: {
        cwd: this.opts.cwd,
        permissionMode: this.opts.permissionMode,
        ...(this.opts.permissionMode === 'bypassPermissions' ? { allowDangerouslySkipPermissions: true } : {}),
        ...(this.sessionId ? { resume: this.sessionId } : {}),
        includePartialMessages: true,
        systemPrompt: { type: 'preset', preset: 'claude_code' },
        settingSources: ['user', 'project', 'local'],
        canUseTool: (toolName, input, { suggestions, decisionReason, signal }) =>
          this.askPermission(toolName, input, suggestions, decisionReason, signal)
      }
    })
    void this.pump(this.q)
  }

  private askPermission(
    toolName: string,
    input: Record<string, unknown>,
    suggestions: PermissionUpdate[] | undefined,
    reason: string | undefined,
    signal: AbortSignal
  ): Promise<PermissionResult> {
    const requestId = randomUUID()
    return new Promise<PermissionResult>((resolve) => {
      this.pending.set(requestId, { input, suggestions, resolve })
      signal.addEventListener('abort', () => {
        if (this.pending.delete(requestId)) {
          resolve({ behavior: 'deny', message: 'Request cancelled.' })
          this.opts.emit({ type: 'event', event: { kind: 'permission_resolved', requestId, behavior: 'deny' } })
        }
      })
      this.opts.emit({
        type: 'event',
        event: {
          kind: 'permission_request',
          requestId,
          toolName,
          input,
          canAlwaysAllow: Boolean(suggestions?.length),
          ...(reason ? { reason } : {})
        }
      })
    })
  }

  private denyAllPending(message: string): void {
    for (const [requestId, pending] of this.pending) {
      pending.resolve({ behavior: 'deny', message })
      this.opts.emit({ type: 'event', event: { kind: 'permission_resolved', requestId, behavior: 'deny' } })
    }
    this.pending.clear()
  }

  private async pump(q: Query): Promise<void> {
    try {
      for await (const message of q) this.handle(message)
    } catch (err) {
      if (!this.interrupted) {
        this.opts.emit({ type: 'event', event: { kind: 'error', message: err instanceof Error ? err.message : String(err) } })
      }
    } finally {
      if (this.q === q) {
        this.q = null
        this.input = null
      }
      this.denyAllPending('The session ended.')
      this.setStream('')
      this.opts.emit({ type: 'closed' })
    }
  }

  private setStream(text: string): void {
    if (text === this.streamed) return
    this.streamed = text
    this.opts.emit({ type: 'stream', text })
  }

  private handle(m: SDKMessage): void {
    const emit = (event: UiEvent) => this.opts.emit({ type: 'event', event })

    switch (m.type) {
      case 'system':
        if (m.subtype === 'init') {
          this.sessionId = m.session_id
          this.opts.emit({ type: 'session', sessionId: m.session_id, model: m.model })
        }
        return

      case 'stream_event': {
        if (m.parent_tool_use_id) return
        const ev = m.event
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          this.setStream(this.streamed + ev.delta.text)
        }
        return
      }

      case 'assistant': {
        // Sub-agent chatter stays out of the feature transcript.
        if (m.parent_tool_use_id) return
        for (const block of m.message.content) {
          if (block.type === 'text' && block.text.trim()) {
            this.setStream('')
            emit({ kind: 'assistant_text', text: block.text })
          } else if (block.type === 'tool_use') {
            emit({
              kind: 'tool_use',
              toolUseId: block.id,
              name: block.name,
              input: (block.input ?? {}) as Record<string, unknown>
            })
          }
        }
        return
      }

      case 'user': {
        if (m.parent_tool_use_id || typeof m.message.content === 'string') return
        for (const block of m.message.content) {
          if (block.type !== 'tool_result') continue
          const content = flattenContent(block.content)
          emit({
            kind: 'tool_result',
            toolUseId: block.tool_use_id,
            content:
              content.length > MAX_TOOL_RESULT_CHARS
                ? `${content.slice(0, MAX_TOOL_RESULT_CHARS)}\n… (${content.length - MAX_TOOL_RESULT_CHARS} more characters)`
                : content,
            isError: Boolean(block.is_error)
          })
        }
        return
      }

      case 'result': {
        this.setStream('')
        const turnCostUsd = Math.max(0, m.total_cost_usd - this.processCostUsd)
        this.processCostUsd = m.total_cost_usd
        emit({
          kind: 'result',
          isError: m.is_error,
          interrupted: this.interrupted,
          text: m.subtype === 'success' ? m.result : m.errors.join('\n'),
          turnCostUsd
        })
        this.interrupted = false
        return
      }

      case 'rate_limit_event': {
        const info = m.rate_limit_info
        emit({
          kind: 'rate_limit',
          status: info.status,
          ...(info.resetsAt ? { resetsAt: info.resetsAt } : {}),
          ...(info.rateLimitType ? { limitType: info.rateLimitType } : {})
        })
        return
      }
    }
  }
}
