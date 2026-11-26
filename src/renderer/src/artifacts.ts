import type { Item, ToolItem } from './transcript'

/** A page published by the agent on claude.ai, found in what it wrote or what its tools returned. */
export interface Artifact {
  url: string
  /** Name the agent gave it, or the end of its link when it gave none. */
  title: string
  /** Latest transcript item mentioning it. */
  seq: number
}

const ARTIFACT_URL = /https:\/\/(?:claude\.ai\/(?:public\/)?artifacts?|claude\.site\/artifacts)\/[A-Za-z0-9_-]+/g
/**
 * Tools that publish artifacts: the Artifact tool family and the claude.ai docs connector. Any other
 * tool only passes links around (a grep, a file written), which says nothing of a page existing.
 */
const PUBLISHING_TOOL = /artifact|claude_docs/i

const MARKDOWN_LINK = /\[([^\]\n]+)\]\((https:\/\/[^)\s]+)\)/g

function urlsIn(text: string): string[] {
  return text.match(ARTIFACT_URL) ?? []
}

function fallbackTitle(url: string): string {
  return url.slice(url.lastIndexOf('/') + 1)
}

function inputTitle(input: Record<string, unknown>): string | undefined {
  for (const key of ['title', 'name']) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

/** Artifacts a run of tool calls published, in the order they came: read from what came back, never from what was sent. */
export function toolArtifacts(tools: ToolItem[]): Artifact[] {
  const found = new Map<string, Artifact>()
  for (const tool of tools) {
    if (!PUBLISHING_TOOL.test(tool.name) || !tool.result || tool.result.isError) continue
    const title = inputTitle(tool.input)
    for (const url of urlsIn(tool.result.content)) found.set(url, { url, title: title ?? found.get(url)?.title ?? fallbackTitle(url), seq: tool.seq })
  }
  return [...found.values()]
}

/** Every artifact of the conversation, the most recently mentioned first. */
export function collectArtifacts(items: Item[]): Artifact[] {
  const found = new Map<string, Artifact>()
  const add = (artifact: Artifact) => {
    const known = found.get(artifact.url)
    // A link named in passing keeps the name a tool call gave it.
    const title = known && known.title !== fallbackTitle(known.url) && artifact.title === fallbackTitle(artifact.url) ? known.title : artifact.title
    found.set(artifact.url, { ...artifact, title })
  }
  for (const item of items) {
    if (item.type === 'tool') toolArtifacts([item]).forEach(add)
    else if (item.type === 'assistant') {
      const named = new Map<string, string>()
      for (const [, label, url] of item.text.matchAll(MARKDOWN_LINK)) named.set(url, label)
      for (const url of urlsIn(item.text)) add({ url, title: named.get(url) ?? fallbackTitle(url), seq: item.seq })
    }
  }
  return [...found.values()].sort((a, b) => b.seq - a.seq)
}
