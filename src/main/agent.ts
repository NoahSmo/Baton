import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import {
  query,
  type PermissionResult,
  type PermissionUpdate,
  type Query,
  type SDKMessage,
  type SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import type { AgentModel, ImageInput, PermissionDecision, PermissionMode, UiEvent } from '../shared/types'

const MAX_TOOL_RESULT_CHARS = 20_000

export type AgentOutput =
  | { type: 'event'; event: UiEvent }
  | { type: 'session'; sessionId: string; model: string }
  | { type: 'stream'; text: string }
  /** Tokens the last request sent: the whole conversation, which every following request sends again. */
  | { type: 'context'; tokens: number }
  /** `ok` is false when the summary failed; the request was paid for all the same. */
  | { type: 'compacted'; ok: boolean; preTokens?: number; postTokens?: number; costUsd: number }
  | { type: 'closed' }

export interface AgentOptions {
  cwd: string
  /** Folder of the documents attached to messages, which the agent reads on its own. */
  attachmentsDir: string
  permissionMode: PermissionMode
  model: AgentModel
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
  toolName: string
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
  private permissionMode: PermissionMode
  private model: AgentModel
  /** Compactions asked for and not finished yet: their results are not turns of the user's. */
  private compactions = 0
  private compactedFrom: { preTokens: number; postTokens?: number } | null = null
  private contextTokens = 0

  constructor(private readonly opts: AgentOptions) {
    this.sessionId = opts.sessionId
    this.permissionMode = opts.permissionMode
    this.model = opts.model
  }

  /** Whether the agent is still blocked on an answer from the user. */
  get hasPendingRequests(): boolean {
    return this.pending.size > 0
  }

  get isRunning(): boolean {
    return this.q !== null
  }

  /**
   * With `compactFirst`, the conversation is summarised before the message goes:
   * after a long pause the prompt cache is gone, and the next requests would
   * otherwise pay for the whole conversation again, then read all of it each time.
   */
  send(text: string, images: ImageInput[] = [], compactFirst = false): void {
    if (!this.q) this.start()
    this.interrupted = false
    if (compactFirst) {
      this.compactions++
      this.input!.push({ type: 'user', message: { role: 'user', content: '/compact' }, parent_tool_use_id: null })
    }
    this.input!.push({
      type: 'user',
      message: {
        role: 'user',
        content: images.length
          ? [
              ...images.map((image) => ({
                type: 'image' as const,
                source: { type: 'base64' as const, media_type: image.mediaType, data: image.data }
              })),
              // The API refuses an empty text block: images can go alone.
              ...(text ? [{ type: 'text' as const, text }] : [])
            ]
          : text
      },
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

  /** Applies to the running turn as well as the next ones. */
  async setPermissionMode(mode: PermissionMode): Promise<void> {
    this.permissionMode = mode
    if (!this.q) return
    await this.q.setPermissionMode(mode)
    if (mode !== 'bypassPermissions') return
    // Requests already on screen were asked under the previous mode; a question still needs its answer.
    for (const [requestId, pending] of [...this.pending]) {
      if (pending.toolName !== 'AskUserQuestion') this.respond(requestId, { behavior: 'allow' })
    }
  }

  /** Takes effect from the next request. */
  async setModel(model: AgentModel): Promise<void> {
    this.model = model
    await this.q?.setModel(model)
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
    this.compactions = 0
    this.compactedFrom = null
    // A folder missing at start-up is skipped, and reading from it would then ask for permission.
    mkdirSync(this.opts.attachmentsDir, { recursive: true })
    this.q = query({
      prompt: this.input,
      options: {
        cwd: this.opts.cwd,
        model: this.model,
        additionalDirectories: [this.opts.attachmentsDir],
        permissionMode: this.permissionMode,
        // Only makes bypass available, so the mode can be switched to it mid-session.
        allowDangerouslySkipPermissions: true,
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
      this.pending.set(requestId, { toolName, input, suggestions, resolve })
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
        } else if (m.subtype === 'compact_boundary') {
          this.compactedFrom = { preTokens: m.compact_metadata.pre_tokens, postTokens: m.compact_metadata.post_tokens }
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
        const usage = m.message.usage
        const tokens = usage
          ? usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
          : 0
        if (tokens && tokens !== this.contextTokens) {
          this.contextTokens = tokens
          this.opts.emit({ type: 'context', tokens })
        }
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
        if (this.compactions > 0) {
          // The user's own message is next in line: their turn has not ended.
          this.compactions--
          const from = this.compactedFrom
          this.compactedFrom = null
          this.opts.emit({ type: 'compacted', ok: Boolean(from), ...from, costUsd: turnCostUsd })
          return
        }
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
          ...(info.rateLimitType ? { limitType: info.rateLimitType } : {}),
          ...(info.utilization !== undefined ? { utilization: info.utilization } : {})
        })
        return
      }
    }
  }
}
