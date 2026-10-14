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
}

/** Last commit and working copy of a file, side by side; removed lines on the left, added ones on the right. */
export function DiffView({ id, path, kind, revision }: Props) {
  const t = useT()
  const host = useRef<HTMLDivElement>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let merge: MergeView | null = null
    void (async () => {
      const [before, file] = await Promise.all([
        kind === 'added' || kind === 'untracked' ? '' : window.api.gitHead(id, path).catch(() => null),
        kind === 'deleted' ? { kind: 'text' as const, content: '' } : window.api.fileRead(id, path).catch(() => null)
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
  }, [id, path, kind, revision])

  return (
    <div className="diff">
      <div className="diff-head">
        <span>{t.git.before}</span>
        <span>{t.git.after}</span>
      </div>
      {notice && <p className="editor-empty">{notice}</p>}
      <div className="diff-body" ref={host} hidden={!!notice} />
    </div>
  )
}
