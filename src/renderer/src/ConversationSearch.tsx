import { useEffect, useRef, useState, type RefObject } from 'react'
import { findOccurrences } from '../../shared/search'
import { useT } from './i18n'

interface Props {
  /** The scrolling transcript whose text is searched. */
  scroller: RefObject<HTMLElement | null>
  /** Changes whenever the transcript does, so the matches are found again. */
  revision: unknown
  onClose(): void
}

/** Every occurrence of a text in the transcript, tool calls folded away included. */
function collectRanges(root: HTMLElement, query: string): Range[] {
  const ranges: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? ''
    for (const start of findOccurrences(text, query)) {
      const range = new Range()
      range.setStart(node, start)
      range.setEnd(node, start + query.length)
      ranges.push(range)
    }
  }
  return ranges
}

/** Opens the folded tool calls around a range, so that it can be seen. */
function reveal(range: Range): void {
  for (let el = range.startContainer.parentElement; el; el = el.parentElement) {
    if (el instanceof HTMLDetailsElement) el.open = true
  }
  range.startContainer.parentElement?.scrollIntoView({ block: 'center' })
}

export function ConversationSearch({ scroller, revision, onClose }: Props) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [at, setAt] = useState(0)
  const [total, setTotal] = useState(0)
  const ranges = useRef<Range[]>([])
  const input = useRef<HTMLInputElement>(null)
  /** Whether the match on screen was moved to by the user: new output must not drag it back. */
  const moved = useRef(false)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  // Find again when the text or the transcript changes.
  useEffect(() => {
    const root = scroller.current
    ranges.current = root && query ? collectRanges(root, query) : []
    setTotal(ranges.current.length)
    setAt((current) => Math.min(current, Math.max(0, ranges.current.length - 1)))
  }, [query, revision, scroller])

  // Paint the matches, the current one apart.
  useEffect(() => {
    const all = ranges.current
    CSS.highlights.set('find', new Highlight(...all))
    if (all[at]) CSS.highlights.set('find-current', new Highlight(all[at]))
    else CSS.highlights.delete('find-current')
    if (all[at] && moved.current) reveal(all[at])
    moved.current = false
  }, [at, total, query, revision])

  useEffect(
    () => () => {
      CSS.highlights.delete('find')
      CSS.highlights.delete('find-current')
    },
    []
  )

  function step(direction: 1 | -1) {
    if (!total) return
    moved.current = true
    setAt((current) => (current + direction + total) % total)
  }

  return (
    <div className="find-bar" role="search">
      <input
        ref={input}
        value={query}
        placeholder={t.search.placeholder}
        aria-label={t.search.placeholder}
        onChange={(e) => {
          moved.current = true
          setAt(0)
          setQuery(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            onClose()
          } else if (e.key === 'Enter') {
            e.preventDefault()
            step(e.shiftKey ? -1 : 1)
          }
        }}
      />
      <span className="num find-count">{query ? t.search.count(total ? at + 1 : 0, total) : ''}</span>
      <button className="icon" title={t.search.previous} aria-label={t.search.previous} disabled={!total} onClick={() => step(-1)}>
        ↑
      </button>
      <button className="icon" title={t.search.next} aria-label={t.search.next} disabled={!total} onClick={() => step(1)}>
        ↓
      </button>
      <button className="icon" title={t.search.close} aria-label={t.search.close} onClick={onClose}>
        ×
      </button>
    </div>
  )
}
