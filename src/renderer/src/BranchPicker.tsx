import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Feature, GitBranch, GitStatus } from '../../shared/types'
import { useT } from './i18n'
import { cleanError } from './NewFeatureDialog'
import { Icon } from './ui/Icon'

const MARGIN = 6

interface Props {
  feature: Feature
  git: GitStatus | null
}

/** The feature's branch, as a button listing the branches its worktree can switch to. */
export function BranchPicker({ feature, git }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [branches, setBranches] = useState<GitBranch[] | null>(null)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  const busy = feature.status === 'working' || feature.status === 'waiting'
  const detached = git !== null && git.branch === null

  function toggle() {
    if (open) return setOpen(false)
    setOpen(true)
    setBranches(null)
    setFilter('')
    setError(null)
    setPosition(null)
    window.api.gitBranches(feature.id).then(setBranches, (err) => setError(cleanError(err)))
  }

  async function pick(branch: GitBranch) {
    setSwitching(true)
    setError(null)
    try {
      await window.api.gitSwitch(feature.id, branch.name)
      setOpen(false)
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setSwitching(false)
    }
  }

  // Measured after render so the list never spills out of the window.
  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) return
    const anchor = button.current.getBoundingClientRect()
    const { width, height } = menu.current.getBoundingClientRect()
    setPosition({
      left: Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - width - MARGIN)),
      top: Math.max(MARGIN, Math.min(anchor.bottom + 4, window.innerHeight - height - MARGIN))
    })
  }, [open, branches, error])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!menu.current?.contains(target) && !button.current?.contains(target)) close()
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const shown = branches?.filter((b) => b.name.toLowerCase().includes(filter.trim().toLowerCase())) ?? []

  return (
    <>
      <button
        ref={button}
        className={`branch-button${open ? ' toggled' : ''}`}
        title={t.git.switchBranch}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
      >
        <code>{detached ? t.git.detached(git.head) : feature.branch}</code>
        <span className="branch-caret"><Icon name="chevron-down" size={12} /></span>
      </button>
      {open && (
        <div
          ref={menu}
          className="ctx-menu branch-menu"
          style={position ?? { left: 0, top: 0, visibility: 'hidden' }}
        >
          <input
            autoFocus
            value={filter}
            placeholder={t.git.filterBranches}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              const first = shown.find((b) => !b.current && !b.heldBy)
              if (e.key === 'Enter' && first && !busy && !switching) void pick(first)
            }}
          />
          {busy && <p className="branch-note">{t.errors.agentBusy}</p>}
          {error && <p className="branch-note error">{error}</p>}
          <div className="branch-list" role="listbox" aria-label={t.git.switchBranch}>
            {!branches && !error && <p className="branch-note">{t.git.loading}</p>}
            {branches && !shown.length && <p className="branch-note">{t.git.noBranch}</p>}
            {shown.map((b) => (
              <button
                key={b.name}
                role="option"
                aria-selected={b.current}
                className={`ctx-item branch-item${b.current ? ' current' : ''}`}
                title={b.heldBy ? t.git.heldByHint(b.heldBy) : b.name}
                disabled={b.current || Boolean(b.heldBy) || busy || switching}
                onClick={() => void pick(b)}
              >
                <span className="branch-check">{b.current && <Icon name="check" size={12} />}</span>
                <span className="branch-name">{b.name}</span>
                {b.remote && <span className="branch-tag">{t.git.remote}</span>}
                {b.heldBy && <span className="branch-tag">{t.git.heldBy(b.heldBy)}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
