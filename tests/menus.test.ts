import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ clipboard: { writeText: vi.fn() }, shell: { openPath: vi.fn(), openExternal: vi.fn() } }))

import { DICTS } from '../src/shared/i18n'
import type { AppState, Feature, MenuAction } from '../src/shared/types'
import { contextMenuTemplate, defaultMenuTemplate, type MenuContext } from '../src/main/menus'

const feature = (over: Partial<Feature> = {}): Feature => ({
  id: 'f1',
  projectId: 'p1',
  title: 'Dark mode',
  linear: null,
  branch: 'feat/dark-mode',
  worktreePath: '/tmp/wt',
  status: 'idle',
  permissionMode: 'default',
  agentModel: 'sonnet',
  sessionId: null,
  model: null,
  costUsd: 0,
  contextTokens: 0,
  limitResetsAt: null,
  pinned: false,
  archived: false,
  queuePosition: null,
  prUrl: null,
  turnBase: null,
  createdAt: 0,
  updatedAt: 0,
  ...over
})

function context(state: AppState, lang: 'en' | 'fr' = 'en', linearConnected = false) {
  const chosen: MenuAction[] = []
  const unlinked: string[] = []
  const removed: string[] = []
  const actions: string[] = []
  const ctx: MenuContext = {
    t: DICTS[lang],
    manager: {
      getState: () => state,
      interrupt: vi.fn(),
      linkIssue: (id: string) => unlinked.push(id),
      setPinned: (id: string, v: boolean) => actions.push(`pin:${id}:${v}`),
      setArchived: (id: string, v: boolean) => actions.push(`archive:${id}:${v}`),
      promoteQueued: (id: string) => actions.push(`promote:${id}`)
    } as unknown as MenuContext['manager'],
    linearConnected,
    removeFeature: (id) => removed.push(`feature:${id}`),
    removeProject: (id) => removed.push(`project:${id}`),
    choose: (action) => chosen.push(action)
  }
  return { ctx, chosen, removed, unlinked, actions }
}

const project = { id: 'p1', name: 'App', path: '/repo', color: '#fff', linearLabel: null, commands: [], templates: [], worktrees: true }
const labels = (items: { label?: string; type?: string }[]) => items.filter((i) => i.type !== 'separator').map((i) => i.label)
const item = (items: { label?: string }[], label: string) => items.find((i) => i.label === label) as any

describe('feature menu', () => {
  it('pins and archives, saying what the next click does', () => {
    const plain = context({ projects: [project], features: [feature()] })
    const items = contextMenuTemplate({ kind: 'feature', featureId: 'f1' }, plain.ctx)
    item(items, 'Pin to the top').click()
    item(items, 'Archive').click()
    expect(plain.actions).toEqual(['pin:f1:true', 'archive:f1:true'])

    const marked = context({ projects: [project], features: [feature({ pinned: true, archived: true })] })
    const back = contextMenuTemplate({ kind: 'feature', featureId: 'f1' }, marked.ctx)
    item(back, 'Unpin').click()
    item(back, 'Restore from the archive').click()
    expect(marked.actions).toEqual(['pin:f1:false', 'archive:f1:false'])
  })

  it('offers to move a queued agent to the front only when others are ahead of it', () => {
    const next = context({ projects: [project], features: [feature({ status: 'queued', queuePosition: 1 })] })
    expect(labels(contextMenuTemplate({ kind: 'feature', featureId: 'f1' }, next.ctx))).not.toContain('Move to the front of the queue')
    const third = context({ projects: [project], features: [feature({ status: 'queued', queuePosition: 3 })] })
    const items = contextMenuTemplate({ kind: 'feature', featureId: 'f1' }, third.ctx)
    item(items, 'Move to the front of the queue').click()
    expect(third.actions).toEqual(['promote:f1'])
  })

  it('continues in a new agent only once the agent has a conversation', () => {
    const fresh = context({ projects: [project], features: [feature()] })
    expect(item(contextMenuTemplate({ kind: 'feature', featureId: 'f1' }, fresh.ctx), 'Continue in a new agent…').enabled).toBe(false)
    const used = context({ projects: [project], features: [feature({ sessionId: 's' })] })
    const items = contextMenuTemplate({ kind: 'feature', featureId: 'f1' }, used.ctx)
    item(items, 'Continue in a new agent…').click()
    expect(used.chosen).toEqual(['continue-feature'])
  })

  it('offers Stop only while a turn is running', () => {
    const idle = context({ projects: [project], features: [feature()] })
    expect(item(contextMenuTemplate({ kind: 'feature', featureId: 'f1' }, idle.ctx), 'Stop').enabled).toBe(false)
    const busy = context({ projects: [project], features: [feature({ status: 'waiting' })] })
    expect(item(contextMenuTemplate({ kind: 'feature', featureId: 'f1' }, busy.ctx), 'Stop').enabled).toBe(true)
  })

  it('links to the Linear issue only when there is one', () => {
    const linked = feature({ linear: { issueId: 'i1', identifier: 'ENG-1', url: 'https://linear.app/x' } })
    const withIssue = contextMenuTemplate({ kind: 'feature', featureId: 'f1' }, context({ projects: [project], features: [linked] }).ctx)
    const without = contextMenuTemplate({ kind: 'feature', featureId: 'f1' }, context({ projects: [project], features: [feature()] }).ctx)
    expect(labels(withIssue)).toContain('Open ENG-1 in Linear')
    expect(labels(without).some((l) => l?.includes('Linear'))).toBe(false)
  })

  it('offers to link an agent to an issue once Linear is connected, and to unlink a linked one', () => {
    const free = context({ projects: [project], features: [feature()] }, 'en', true)
    item(contextMenuTemplate({ kind: 'feature', featureId: 'f1' }, free.ctx), 'Link to a Linear issue…').click()
    expect(free.chosen).toEqual(['link-feature'])

    const linked = feature({ linear: { issueId: 'i1', identifier: 'ENG-1', url: 'https://linear.app/x' } })
    const tied = context({ projects: [project], features: [linked] }, 'en', true)
    const items = contextMenuTemplate({ kind: 'feature', featureId: 'f1' }, tied.ctx)
    expect(labels(items)).not.toContain('Link to a Linear issue…')
    item(items, 'Unlink from ENG-1').click()
    expect(tied.unlinked).toEqual(['f1'])
  })

  it('hands rename back to the renderer and routes delete through confirmation', () => {
    const { ctx, chosen, removed } = context({ projects: [project], features: [feature()] })
    const items = contextMenuTemplate({ kind: 'feature', featureId: 'f1' }, ctx)
    expect(item(items, 'Delete…').danger).toBe(true)
    item(items, 'Rename…').click()
    item(items, 'Delete…').click()
    expect(chosen).toEqual(['rename-feature'])
    expect(removed).toEqual(['feature:f1'])
  })

  it('is empty for a feature that no longer exists', () => {
    expect(contextMenuTemplate({ kind: 'feature', featureId: 'gone' }, context({ projects: [], features: [] }).ctx)).toEqual([])
  })
})

describe('project menu', () => {
  it('only lets an empty project be removed', () => {
    const empty = contextMenuTemplate({ kind: 'project', projectId: 'p1' }, context({ projects: [project], features: [] }).ctx)
    const used = contextMenuTemplate({ kind: 'project', projectId: 'p1' }, context({ projects: [project], features: [feature()] }).ctx)
    expect(item(empty, 'Remove project…').enabled).toBe(true)
    expect(item(used, 'Remove project…').enabled).toBe(false)
  })

  it('is translated', () => {
    const items = contextMenuTemplate({ kind: 'project', projectId: 'p1' }, context({ projects: [project], features: [] }, 'fr').ctx)
    expect(labels(items)).toEqual(expect.arrayContaining(['Nouvel agent', 'Réglages du projet…', 'Copier le chemin', 'Retirer le projet…']))
  })
})

const edit = { cut: vi.fn(), copy: vi.fn(), paste: vi.fn(), selectAll: vi.fn() }

describe('text menus', () => {
  it('skips entries with nothing to copy', () => {
    const { ctx } = context({ projects: [], features: [] })
    const items = contextMenuTemplate({ kind: 'text', entries: [{ label: 'input', text: 'ls' }, { label: 'output', text: '' }] }, ctx)
    expect(labels(items)).toEqual(['Copy input'])
  })

  it('offers editing commands in fields, copy on selections, nothing elsewhere', () => {
    const t = DICTS.en
    expect(labels(defaultMenuTemplate({ isEditable: true, selectionText: '', linkURL: '' }, t, edit))).toEqual(['Cut', 'Copy', 'Paste', 'Select all'])
    expect(labels(defaultMenuTemplate({ isEditable: false, selectionText: 'abc', linkURL: '' }, t, edit))).toEqual(['Copy'])
    expect(labels(defaultMenuTemplate({ isEditable: false, selectionText: '', linkURL: 'https://x.dev' }, t, edit))).toEqual(['Open link', 'Copy link'])
    expect(defaultMenuTemplate({ isEditable: false, selectionText: ' ', linkURL: 'file:///etc' }, t, edit)).toEqual([])
  })
})
