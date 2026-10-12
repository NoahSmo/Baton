import { DatabaseSync } from 'node:sqlite'
import { PROJECT_COLORS, type Feature, type Project, type StoredEvent, type UiEvent } from '../shared/types'

type Row = Record<string, unknown>

function toProject(r: Row): Project {
  return {
    id: r.id as string,
    name: r.name as string,
    path: r.path as string,
    color: (r.color as string | null) ?? PROJECT_COLORS[0],
    linearProject: r.linear_project_id
      ? { id: r.linear_project_id as string, name: r.linear_project_name as string }
      : null
  }
}

function toFeature(r: Row): Feature {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    title: r.title as string,
    linear: r.linear_issue_id
      ? {
          issueId: r.linear_issue_id as string,
          identifier: r.linear_identifier as string,
          url: r.linear_url as string
        }
      : null,
    branch: r.branch as string,
    worktreePath: r.worktree_path as string,
    status: r.status as Feature['status'],
    permissionMode: r.permission_mode as Feature['permissionMode'],
    sessionId: (r.session_id as string | null) ?? null,
    model: (r.model as string | null) ?? null,
    costUsd: r.cost_usd as number,
    limitResetsAt: (r.limit_resets_at as number | null) ?? null,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number
  }
}

export class Store {
  private db: DatabaseSync

  constructor(file: string) {
    this.db = new DatabaseSync(file)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS features (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL,
        branch TEXT NOT NULL,
        worktree_path TEXT NOT NULL,
        status TEXT NOT NULL,
        permission_mode TEXT NOT NULL,
        session_id TEXT,
        model TEXT,
        cost_usd REAL NOT NULL DEFAULT 0,
        limit_resets_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        feature_id TEXT NOT NULL,
        at INTEGER NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_feature ON events(feature_id, seq);
    `)
    this.addColumns('features', ['linear_issue_id TEXT', 'linear_identifier TEXT', 'linear_url TEXT'])
    this.addColumns('projects', ['color TEXT', 'linear_project_id TEXT', 'linear_project_name TEXT'])
  }

  /** Columns added after the first release; databases created before them are upgraded in place. */
  private addColumns(table: string, definitions: string[]): void {
    const existing = new Set((this.db.prepare(`PRAGMA table_info(${table})`).all() as Row[]).map((r) => r.name))
    for (const definition of definitions) {
      if (!existing.has(definition.split(' ')[0])) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
    }
  }

  listProjects(): Project[] {
    return (this.db.prepare('SELECT * FROM projects ORDER BY rowid').all() as Row[]).map(toProject)
  }

  getProject(id: string): Project | undefined {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Row | undefined
    return row && toProject(row)
  }

  getProjectByPath(path: string): Project | undefined {
    const row = this.db.prepare('SELECT * FROM projects WHERE path = ?').get(path) as Row | undefined
    return row && toProject(row)
  }

  insertProject(p: Project): void {
    this.db
      .prepare('INSERT INTO projects (id, name, path, color, linear_project_id, linear_project_name) VALUES (?, ?, ?, ?, ?, ?)')
      .run(p.id, p.name, p.path, p.color, p.linearProject?.id ?? null, p.linearProject?.name ?? null)
  }

  updateProject(p: Project): void {
    this.db
      .prepare('UPDATE projects SET name = ?, color = ?, linear_project_id = ?, linear_project_name = ? WHERE id = ?')
      .run(p.name, p.color, p.linearProject?.id ?? null, p.linearProject?.name ?? null, p.id)
  }

  deleteProject(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }

  listFeatures(): Feature[] {
    return (this.db.prepare('SELECT * FROM features ORDER BY created_at DESC').all() as Row[]).map(toFeature)
  }

  getFeature(id: string): Feature | undefined {
    const row = this.db.prepare('SELECT * FROM features WHERE id = ?').get(id) as Row | undefined
    return row && toFeature(row)
  }

  insertFeature(f: Feature): void {
    this.db
      .prepare(
        `INSERT INTO features (id, project_id, title, branch, worktree_path, status, permission_mode,
           session_id, model, cost_usd, limit_resets_at, created_at, updated_at,
           linear_issue_id, linear_identifier, linear_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        f.id,
        f.projectId,
        f.title,
        f.branch,
        f.worktreePath,
        f.status,
        f.permissionMode,
        f.sessionId,
        f.model,
        f.costUsd,
        f.limitResetsAt,
        f.createdAt,
        f.updatedAt,
        f.linear?.issueId ?? null,
        f.linear?.identifier ?? null,
        f.linear?.url ?? null
      )
  }

  updateFeature(f: Feature): void {
    this.db
      .prepare(
        `UPDATE features SET title = ?, status = ?, session_id = ?, model = ?, cost_usd = ?, limit_resets_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(f.title, f.status, f.sessionId, f.model, f.costUsd, f.limitResetsAt, f.updatedAt, f.id)
  }

  deleteFeature(id: string): void {
    this.db.prepare('DELETE FROM events WHERE feature_id = ?').run(id)
    this.db.prepare('DELETE FROM features WHERE id = ?').run(id)
  }

  appendEvent(featureId: string, event: UiEvent): StoredEvent {
    const at = Date.now()
    const res = this.db
      .prepare('INSERT INTO events (feature_id, at, payload) VALUES (?, ?, ?)')
      .run(featureId, at, JSON.stringify(event))
    return { seq: Number(res.lastInsertRowid), featureId, at, event }
  }

  listEvents(featureId: string): StoredEvent[] {
    const rows = this.db
      .prepare('SELECT seq, at, payload FROM events WHERE feature_id = ? ORDER BY seq')
      .all(featureId) as Row[]
    return rows.map((r) => ({
      seq: r.seq as number,
      featureId,
      at: r.at as number,
      event: JSON.parse(r.payload as string) as UiEvent
    }))
  }
}
