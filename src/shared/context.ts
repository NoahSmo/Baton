/** The context window of an agent, as Claude Code's /context reports it. */

export type ContextKind = 'used' | 'free' | 'buffer' | 'deferred'

export interface ContextCategory {
  /** Stable id of the row; absent from older CLIs, which only give the English name. */
  id?: string
  name: string
  tokens: number
  kind: ContextKind
}

export interface ContextUsage {
  model: string
  totalTokens: number
  /** The window usage is measured against. */
  maxTokens: number
  /** Rounded share of the window in use, 0-100+. */
  percentage: number
  categories: ContextCategory[]
  /** MCP tool schemas, summed per server. */
  mcpServers: { name: string; tokens: number }[]
  memoryFiles: { path: string; type: string; tokens: number }[]
  skills: { name: string; tokens: number }[]
}

export interface ContextRow extends ContextCategory {
  /** Share of the window, 0-100; null for deferred rows, which are outside it. */
  share: number | null
}

/** Rows as the card lists them: what fills the window, largest first, then the reserve and free space, then what is kept out of it. Empty rows are dropped. */
export function contextRows(usage: ContextUsage): { used: ContextRow[]; rest: ContextRow[]; deferred: ContextRow[] } {
  const share = (c: ContextCategory) => (usage.maxTokens > 0 ? (c.tokens / usage.maxTokens) * 100 : 0)
  const rows = usage.categories.filter((c) => c.tokens > 0)
  const of = (kind: ContextKind) => rows.filter((c) => c.kind === kind).map((c) => ({ ...c, share: kind === 'deferred' ? null : share(c) }))
  return {
    used: of('used').sort((a, b) => b.tokens - a.tokens),
    rest: [...of('buffer'), ...of('free')],
    deferred: of('deferred')
  }
}

/** Sums tool schemas per MCP server, largest first. */
export function byServer(tools: { serverName: string; tokens: number }[]): { name: string; tokens: number }[] {
  const sums = new Map<string, number>()
  for (const tool of tools) sums.set(tool.serverName, (sums.get(tool.serverName) ?? 0) + tool.tokens)
  return [...sums].map(([name, tokens]) => ({ name, tokens })).sort((a, b) => b.tokens - a.tokens)
}
