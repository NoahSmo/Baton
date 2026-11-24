import { useEffect, useRef, useState } from 'react'
import {
  deleteGroup,
  groupProject,
  moveGroup,
  moveProject,
  shift,
  ungroupProject,
  updateGroup,
  type DropTarget,
  type RailGroup
} from '../../shared/railLayout'
import type { Feature, MenuAction, Project } from '../../shared/types'
import { openContextMenu } from './contextMenu'
import { useT } from './i18n'
import type { RailState } from './useRailLayout'
import { Icon } from './ui/Icon'

interface Props {
  projects: Project[]
  rail: RailState
  features: Feature[]
  activeId: string | null
  onSelect(id: string): void
  onNew(): void
  onOpenUsage(): void
  onOpenSettings(): void
  /** A choice from an avatar's context menu that needs a dialog. */
  onMenuAction(project: Project, action: MenuAction): void
}

/** Two letters standing for a project: "studio-web" → "SW", "demo" → "DE". */
export function initials(name: string): string {
  const words = name.split(/[\s\-_./]+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}

/** A project's picture, or its initials on its color. Sized by the surrounding CSS. */
export function ProjectAvatar({ name, image, className = '' }: { name: string; image: string | null; className?: string }) {
  return (
    <span className={`rail-avatar${image ? ' has-image' : ''} ${className}`}>
      {image ? <img src={image} alt="" draggable={false} /> : initials(name)}
    </span>
  )
}

type Dragged = { kind: 'project' | 'group'; id: string }

/** Where the dragged entry would land, drawn as a line (before, after), a frame (into) or at the foot of the list. */
type DropHint = { id: string; place: 'before' | 'after' | 'into' | 'end' }

/** Vertical strip of project avatars, grouped and ordered as the user arranged them, with the app's global actions at the bottom. */
export function ProjectRail({ projects, rail, features, activeId, onSelect, onNew, onOpenUsage, onOpenSettings, onMenuAction }: Props) {
  const t = useT()
  const [dragged, setDragged] = useState<Dragged | null>(null)
  const [hint, setHint] = useState<DropHint | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const target = useRef<DropTarget | null>(null)
  const byId = new Map(projects.map((p) => [p.id, p]))

  function stats(ids: string[]) {
    const own = features.filter((f) => ids.includes(f.projectId))
    return { waiting: own.filter((f) => f.status === 'waiting').length, working: own.some((f) => f.status === 'working') }
  }

  function over(e: React.DragEvent, next: DropTarget, at: DropHint) {
    if (!dragged) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    target.current = next
    if (hint?.id !== at.id || hint.place !== at.place) setHint(at)
  }

  function finish() {
    setDragged(null)
    setHint(null)
    target.current = null
  }

  function drop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    const to = target.current
    if (dragged && to) rail.update((layout) => (dragged.kind === 'group' ? moveGroup(layout, dragged.id, to) : moveProject(layout, dragged.id, to)))
    finish()
  }

  const dragSource = (kind: Dragged['kind'], id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation()
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', id)
      setDragged({ kind, id })
    },
    onDragEnd: finish
  })

  /** A drag over a project: before or after it, by the half of it the pointer is in. */
  const projectDrop = (id: string, grouped: boolean) => ({
    onDragOver: (e: React.DragEvent) => {
      // A group dragged over one of its projects is handled by the group around it.
      if (dragged?.kind === 'group' && grouped) return
      const rect = e.currentTarget.getBoundingClientRect()
      const after = e.clientY >= rect.top + rect.height / 2
      over(e, { kind: 'near', id, after }, { id, place: after ? 'after' : 'before' })
    },
    onDrop: drop
  })

  function renderProject(p: Project, grouped: boolean) {
    const { waiting, working } = stats([p.id])
    const dropClass = hint?.id === p.id && (hint.place === 'before' || hint.place === 'after') ? ` drop-${hint.place}` : ''
    return (
      <button
        key={p.id}
        className={`rail-item${p.id === activeId ? ' active' : ''}${grouped ? ' grouped' : ''}${dragged?.id === p.id ? ' dragging' : ''}${dropClass}`}
        style={{ '--tab-color': p.color } as React.CSSProperties}
        title={p.name}
        onClick={() => onSelect(p.id)}
        onContextMenu={async (e) => {
          const action = await openContextMenu(e, { kind: 'project', projectId: p.id, grouped })
          if (action === 'group-project') {
            const id = crypto.randomUUID()
            rail.update((layout) => groupProject(layout, p.id, id, ''))
            setEditing(id)
          } else if (action === 'move-up' || action === 'move-down') rail.update((layout) => shift(layout, p.id, action === 'move-up' ? -1 : 1))
          else if (action === 'ungroup-project') rail.update((layout) => ungroupProject(layout, p.id))
          else if (action) onMenuAction(p, action)
        }}
        {...dragSource('project', p.id)}
        {...projectDrop(p.id, grouped)}
      >
        <ProjectAvatar name={p.name} image={p.image} />
        <span className="rail-name">{p.name}</span>
        {waiting > 0 && (
          <span className="rail-badge num" title={t.topbar.waitingBadge}>
            {waiting}
          </span>
        )}
        {working && <span className="dot working rail-dot" />}
      </button>
    )
  }

  function renderGroup(group: RailGroup) {
    const members = group.projectIds.flatMap((id) => byId.get(id) ?? [])
    const { waiting, working } = stats(group.projectIds)
    const name = group.name || t.rail.newGroup
    const dropClass = hint?.id === group.id ? ` drop-${hint.place}` : ''
    const toggle = () => rail.update((layout) => updateGroup(layout, group.id, { collapsed: !group.collapsed }))
    const nameInput = (
      <GroupNameInput
        initial={group.name}
        label={t.rail.groupName}
        onDone={(value) => {
          setEditing(null)
          if (value !== null) rail.update((layout) => updateGroup(layout, group.id, { name: value }))
        }}
      />
    )
    return (
      <div
        key={group.id}
        className={`rail-group${group.collapsed ? ' collapsed' : ''}${dragged?.id === group.id ? ' dragging' : ''}${dropClass}`}
        onDragOver={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          if (dragged?.kind === 'group') {
            const after = e.clientY >= rect.top + rect.height / 2
            return over(e, { kind: 'near', id: group.id, after }, { id: group.id, place: after ? 'after' : 'before' })
          }
          // A project dropped on the upper part of the header goes above the group, on the lower part inside it.
          const header = e.currentTarget.firstElementChild?.getBoundingClientRect() ?? rect
          if (e.clientY < header.top + header.height / 3) over(e, { kind: 'near', id: group.id, after: false }, { id: group.id, place: 'before' })
          else over(e, { kind: 'into', groupId: group.id }, { id: group.id, place: 'into' })
        }}
        onDrop={drop}
      >
        <div
          className={`rail-group-head${members.some((p) => p.id === activeId) ? ' has-active' : ''}`}
          onContextMenu={async (e) => {
            const action = await openContextMenu(e, { kind: 'group', groupId: group.id, collapsed: group.collapsed })
            if (action === 'toggle-group') toggle()
            else if (action === 'rename-group') setEditing(group.id)
            else if (action === 'move-up' || action === 'move-down') rail.update((layout) => shift(layout, group.id, action === 'move-up' ? -1 : 1))
            else if (action === 'delete-group') rail.update((layout) => deleteGroup(layout, group.id))
          }}
          {...dragSource('group', group.id)}
        >
          {group.collapsed ? (
            editing === group.id ? (
              <div className="rail-folder">
                <FolderTile members={members} />
                {nameInput}
              </div>
            ) : (
              <button
                className="rail-folder"
                title={name}
                aria-expanded={false}
                aria-label={t.rail.expand(name)}
                onClick={toggle}
                onDoubleClick={() => setEditing(group.id)}
              >
                <FolderTile members={members} />
                <span className="rail-name">{name}</span>
                {waiting > 0 && <span className="rail-badge num">{waiting}</span>}
                {working && <span className="dot working rail-dot" />}
              </button>
            )
          ) : editing === group.id ? (
            nameInput
          ) : (
            <button
              className="rail-group-lid"
              title={name}
              aria-expanded
              aria-label={t.rail.collapse(name)}
              onClick={toggle}
              onDoubleClick={() => setEditing(group.id)}
            >
              <span className="rail-group-name">{name}</span>
              <Icon name="chevron-down" size={10} />
            </button>
          )}
        </div>
        {!group.collapsed && members.map((p) => renderProject(p, true))}
      </div>
    )
  }

  return (
    <nav className="rail" aria-label={t.rail.projects}>
      <div
        className={`rail-list${hint?.place === 'end' ? ' drop-end' : ''}`}
        onDragOver={(e) => over(e, { kind: 'end' }, { id: '', place: 'end' })}
        onDrop={drop}
      >
        {rail.layout.map((entry) => {
          if (entry.type === 'group') return renderGroup(entry)
          const p = byId.get(entry.id)
          return p && renderProject(p, false)
        })}
        <button className="rail-add" onClick={onNew} title={t.topbar.newProject} aria-label={t.topbar.newProject}>
          <Icon name="plus" size={16} />
        </button>
      </div>
      <div className="rail-foot">
        <button className="rail-tool" onClick={onOpenUsage} title={t.usage.title} aria-label={t.usage.title}>
          <Icon name="chart" size={16} />
        </button>
        <button className="rail-tool" onClick={onOpenSettings} title={t.update.settingsOpen} aria-label={t.update.settingsOpen}>
          <Icon name="settings" size={16} />
        </button>
      </div>
    </nav>
  )
}

/** A folded group's face: its first four projects in a 2×2 grid, the way a phone shows a folder of apps. */
function FolderTile({ members }: { members: Project[] }) {
  return (
    <span className="rail-folder-tile" aria-hidden>
      {[0, 1, 2, 3].map((i) => {
        const p = members[i]
        if (!p) return <span key={i} className="rail-folder-cell empty" />
        return (
          <span key={p.id} className="rail-folder-cell" style={{ '--tab-color': p.color } as React.CSSProperties}>
            {p.image && <img src={p.image} alt="" draggable={false} />}
          </span>
        )
      })}
    </span>
  )
}

/** Name of a group being typed: Enter or leaving the field keeps it, Escape drops the change. */
function GroupNameInput({ initial, label, onDone }: { initial: string; label: string; onDone(value: string | null): void }) {
  const ref = useRef<HTMLInputElement>(null)
  const settled = useRef(false)
  useEffect(() => ref.current?.select(), [])
  const settle = (value: string | null) => {
    if (settled.current) return
    settled.current = true
    onDone(value)
  }
  return (
    <input
      ref={ref}
      className="rail-group-input"
      defaultValue={initial}
      aria-label={label}
      maxLength={24}
      autoFocus
      onBlur={(e) => settle(e.currentTarget.value.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') settle(e.currentTarget.value.trim())
        if (e.key === 'Escape') settle(null)
        e.stopPropagation()
      }}
    />
  )
}
