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
  createdAt: 0,
  updatedAt: 0,
  ...over
})

function context(state: AppState, lang: 'en' | 'fr' = 'en', linearConnected = false) {
  const chosen: MenuAction[] = []
  const unlinked: string[] = []
  const removed: string[] = []
  const ctx: MenuContext = {
    t: DICTS[lang],
    manager: { getState: () => state, interrupt: vi.fn(), linkIssue: (id: string) => unlinked.push(id) } as unknown as MenuContext['manager'],
    linearConnected,
    removeFeature: (id) => removed.push(`feature:${id}`),
    removeProject: (id) => removed.push(`project:${id}`),
    choose: (action) => chosen.push(action)
  }
  return { ctx, chosen, removed, unlinked }
}

const project = { id: 'p1', name: 'App', path: '/repo', color: '#fff', linearLabel: null }
const labels = (items: { label?: string; type?: string }[]) => items.filter((i) => i.type !== 'separator').map((i) => i.label)
const item = (items: { label?: string }[], label: string) => items.find((i) => i.label === label) as any

describe('feature menu', () => {
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
