import { mkdtempSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Store } from '../src/main/store'

const project = { id: 'p', name: 'P', path: '/p', color: '#fff', commands: [], templates: [], worktrees: true, qa: { enabled: false, command: '' } }

describe('project Linear labels', () => {
  it('keeps several labels per project', () => {
    const store = new Store(':memory:')
    store.insertProject({ ...project, linearLabels: [{ id: 'l1', name: 'Web' }, { id: 'l2', name: 'API' }] })
    expect(store.getProject('p')?.linearLabels.map((l) => l.id)).toEqual(['l1', 'l2'])
    store.updateProject({ ...project, linearLabels: [] })
    expect(store.getProject('p')?.linearLabels).toEqual([])
  })

  it('upgrades the single label of an older database', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'baton-store-')), 'old.db')
    const old = new DatabaseSync(file)
    old.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, linear_label_id TEXT, linear_label_name TEXT)`)
    old.prepare('INSERT INTO projects (id, name, path, linear_label_id, linear_label_name) VALUES (?, ?, ?, ?, ?)').run('p', 'P', '/p', 'l1', 'Web')
    old.close()
    expect(new Store(file).getProject('p')?.linearLabels).toEqual([{ id: 'l1', name: 'Web' }])
  })
})
