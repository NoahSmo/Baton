import { MergeView } from '@codemirror/merge'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { useEffect, useRef, useState } from 'react'
import type { GitChangeKind } from '../../shared/types'
import { editorTheme } from './editorTheme'
import { useT } from './i18n'

interface Props {
  id: string
  path: string
  kind: GitChangeKind
  /** Changes whenever the worktree does, so the comparison is read again. */
  revision: unknown
  /** Tree to compare with instead of the last commit: the worktree when a turn began. */
  baseRef?: string
  /** Two commits to compare instead of the worktree: `before` null is the empty tree of a root commit. */
  commits?: { before: string | null; after: string }
  /** Titles of the two sides, when they are not the last commit and the working copy. */
  labels?: [string, string]
}

/** Last commit and working copy of a file, side by side; removed lines on the left, added ones on the right. */
export function DiffView({ id, path, kind, revision, baseRef, commits, labels }: Props) {
  const t = useT()
  const host = useRef<HTMLDivElement>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let merge: MergeView | null = null
    void (async () => {
      const empty = { kind: 'text' as const, content: '' }
      const atCommit = async (rev: string) => {
        const content = await window.api.gitHead(id, path, rev).catch(() => null)
        return content === null ? null : { kind: 'text' as const, content }
      }
      const [before, file] = await Promise.all([
        kind === 'added' || kind === 'untracked' || (commits && !commits.before)
          ? ''
          : window.api.gitHead(id, path, commits?.before ?? baseRef).catch(() => null),
        kind === 'deleted' ? empty : commits ? atCommit(commits.after) : window.api.fileRead(id, path).catch(() => null)
      ])
      if (cancelled) return
      if (before === null || file?.kind !== 'text') return setNotice(file?.kind === 'text' ? t.editor.unreadable : t.editor.binary)
      setNotice(null)
      const language: Extension =
        (await LanguageDescription.matchFilename(languages, path)
          ?.load()
          .catch(() => null)) ?? []
      if (cancelled || !host.current) return
      const extensions = [lineNumbers(), EditorState.readOnly.of(true), EditorView.editable.of(false), language, editorTheme]
      merge = new MergeView({
        a: { doc: before, extensions },
        b: { doc: file.content, extensions },
        parent: host.current,
        highlightChanges: true,
        gutter: true,
        collapseUnchanged: { margin: 3, minSize: 6 }
      })
    })()
    return () => {
      cancelled = true
      merge?.destroy()
    }
  }, [id, path, kind, revision, baseRef, commits?.before, commits?.after])

  return (
    <div className="diff">
      <div className="diff-head">
        <span>{labels?.[0] ?? (baseRef ? t.git.beforeTurn : t.git.before)}</span>
        <span>{labels?.[1] ?? t.git.after}</span>
      </div>
      {notice && <p className="editor-empty">{notice}</p>}
      <div className="diff-body" ref={host} hidden={!!notice} />
    </div>
  )
}
