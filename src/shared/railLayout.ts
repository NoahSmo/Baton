/** How the project rail is arranged: projects in order, some gathered in groups that fold. */

export interface RailGroup {
  type: 'group'
  id: string
  name: string
  collapsed: boolean
  projectIds: string[]
}

export interface RailProject {
  type: 'project'
  id: string
}

export type RailEntry = RailProject | RailGroup

export type RailLayout = RailEntry[]

/** Where a dragged entry lands: next to another one (a project or a group, by id), inside a group, or last. */
export type DropTarget = { kind: 'near'; id: string; after: boolean } | { kind: 'into'; groupId: string } | { kind: 'end' }

/**
 * Brings a stored layout up to date with the projects that exist: removed ones
 * disappear, new ones come last, and a project appears only once.
 */
export function reconcile(layout: RailLayout, projectIds: string[]): RailLayout {
  const known = new Set(projectIds)
  const seen = new Set<string>()
  const keep = (id: string) => known.has(id) && !seen.has(id) && Boolean(seen.add(id))
  const out: RailLayout = []
  for (const entry of layout) {
    if (entry.type === 'project') {
      if (keep(entry.id)) out.push(entry)
    } else {
      out.push({ ...entry, projectIds: entry.projectIds.filter(keep) })
    }
  }
  for (const id of projectIds) if (keep(id)) out.push({ type: 'project', id })
  return out
}

/** Project ids as the rail shows them from top to bottom, folded groups included. */
export function flatten(layout: RailLayout): string[] {
  return layout.flatMap((entry) => (entry.type === 'project' ? [entry.id] : entry.projectIds))
}

/** The group holding a project, if it is in one. */
export function groupOf(layout: RailLayout, projectId: string): RailGroup | undefined {
  return layout.find((e): e is RailGroup => e.type === 'group' && e.projectIds.includes(projectId))
}

const without = (layout: RailLayout, projectId: string): RailLayout =>
  layout
    .filter((e) => !(e.type === 'project' && e.id === projectId))
    .map((e) => (e.type === 'group' ? { ...e, projectIds: e.projectIds.filter((id) => id !== projectId) } : e))

/** Inserts into a list next to `id`; false when `id` is not in it. */
function insertNear<T>(list: T[], item: T, id: string, after: boolean, idOf: (item: T) => string): T[] | null {
  const at = list.findIndex((x) => idOf(x) === id)
  if (at < 0) return null
  const next = [...list]
  next.splice(after ? at + 1 : at, 0, item)
  return next
}

export function moveProject(layout: RailLayout, projectId: string, to: DropTarget): RailLayout {
  if (to.kind === 'near' && to.id === projectId) return layout
  const base = without(layout, projectId)
  const entry: RailProject = { type: 'project', id: projectId }

  if (to.kind === 'into') {
    return base.map((e) => (e.type === 'group' && e.id === to.groupId ? { ...e, projectIds: [projectId, ...e.projectIds] } : e))
  }
  if (to.kind === 'near') {
    const group = groupOf(base, to.id)
    if (group) {
      const projectIds = insertNear(group.projectIds, projectId, to.id, to.after, (id) => id)!
      return base.map((e) => (e === group ? { ...group, projectIds } : e))
    }
    return insertNear<RailEntry>(base, entry, to.id, to.after, (e) => e.id) ?? [...base, entry]
  }
  return [...base, entry]
}

export function moveGroup(layout: RailLayout, groupId: string, to: DropTarget): RailLayout {
  const moving = layout.find((e): e is RailGroup => e.type === 'group' && e.id === groupId)
  if (!moving || (to.kind === 'near' && to.id === groupId)) return layout
  const base = layout.filter((e) => e !== moving)
  if (to.kind === 'near') {
    // Next to a project of another group means next to that group.
    const anchor = groupOf(base, to.id)?.id ?? to.id
    return insertNear<RailEntry>(base, moving, anchor, to.after, (e) => e.id) ?? [...base, moving]
  }
  return [...base, moving]
}

/** One step up or down, for the menu and the keyboard: inside its group, then out of it past the edge; groups step over whole entries. */
export function shift(layout: RailLayout, id: string, step: -1 | 1): RailLayout {
  const group = groupOf(layout, id)
  const list: string[] = group ? group.projectIds : layout.map((e) => e.id)
  const at = list.indexOf(id)
  if (at < 0) return layout
  const to = at + step
  if (to >= 0 && to < list.length) {
    const next = [...list]
    ;[next[at], next[to]] = [next[to], next[at]]
    if (group) return layout.map((e) => (e === group ? { ...group, projectIds: next } : e))
    const byId = new Map(layout.map((e) => [e.id, e]))
    return next.map((k) => byId.get(k)!)
  }
  // Past the edge of a group: out of it, next to it.
  if (group) return moveProject(layout, id, { kind: 'near', id: group.id, after: step > 0 })
  return layout
}

/** Puts a project alone in a new group, where the project stood. */
export function groupProject(layout: RailLayout, projectId: string, groupId: string, name: string): RailLayout {
  const group: RailGroup = { type: 'group', id: groupId, name, collapsed: false, projectIds: [projectId] }
  const inGroup = groupOf(layout, projectId)
  if (inGroup) {
    return layout.flatMap((e) => (e === inGroup ? [{ ...e, projectIds: e.projectIds.filter((id) => id !== projectId) }, group] : [e]))
  }
  return layout.map((e) => (e.type === 'project' && e.id === projectId ? group : e))
}

/** Takes a project out of its group, right below it. */
export function ungroupProject(layout: RailLayout, projectId: string): RailLayout {
  const group = groupOf(layout, projectId)
  if (!group) return layout
  return layout.flatMap((e) =>
    e === group ? [{ ...e, projectIds: e.projectIds.filter((id) => id !== projectId) }, { type: 'project' as const, id: projectId }] : [e]
  )
}

/** Dissolves a group; its projects stay where it was. */
export function deleteGroup(layout: RailLayout, groupId: string): RailLayout {
  return layout.flatMap((e) => (e.type === 'group' && e.id === groupId ? e.projectIds.map((id): RailProject => ({ type: 'project', id })) : [e]))
}

export function updateGroup(layout: RailLayout, groupId: string, patch: Partial<Pick<RailGroup, 'name' | 'collapsed'>>): RailLayout {
  return layout.map((e) => (e.type === 'group' && e.id === groupId ? { ...e, ...patch } : e))
}

/** A stored layout, or an empty one when the text is missing or not one. */
export function parseLayout(raw: string | null): RailLayout {
  try {
    const value = JSON.parse(raw ?? '[]') as unknown
    if (!Array.isArray(value)) return []
    return value.flatMap((e): RailEntry[] => {
      if (!e || typeof e !== 'object' || typeof e.id !== 'string') return []
      if (e.type === 'project') return [{ type: 'project', id: e.id }]
      if (e.type === 'group' && Array.isArray(e.projectIds)) {
        return [
          {
            type: 'group',
            id: e.id,
            name: typeof e.name === 'string' ? e.name : '',
            collapsed: e.collapsed === true,
            projectIds: e.projectIds.filter((id: unknown): id is string => typeof id === 'string')
          }
        ]
      }
      return []
    })
  } catch {
    return []
  }
}
