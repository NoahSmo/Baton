import { DatabaseSync } from 'node:sqlite'
import { AGENT_MODELS, DEFAULT_AGENT_MODEL, DEFAULT_QA, PROJECT_COLORS, type AgentModel, type Feature, type LaunchCommand, type Project, type QaConfig, type QaRun, type PromptTemplate, type StoredEvent, type TurnCost, type UiEvent } from '../shared/types'

type Row = Record<string, unknown>

function toProject(r: Row): Project {
  return {
    id: r.id as string,
    name: r.name as string,
    path: r.path as string,
    color: (r.color as string | null) ?? PROJECT_COLORS[0],
    linearLabel: r.linear_label_id ? { id: r.linear_label_id as string, name: r.linear_label_name as string } : null,
    commands: r.commands ? (JSON.parse(r.commands as string) as LaunchCommand[]) : [],
    templates: r.templates ? (JSON.parse(r.templates as string) as PromptTemplate[]) : [],
    worktrees: r.worktrees !== 0,
    qa: r.qa ? (JSON.parse(r.qa as string) as QaConfig) : DEFAULT_QA
  }
}

function toQaRun(r: Row): QaRun {
  return {
    id: r.id as string,
    featureId: r.feature_id as string,
    projectId: r.project_id as string,
    featureTitle: r.feature_title as string,
    command: r.command as string,
    status: r.status as QaRun['status'],
    exitCode: (r.exit_code as number | null) ?? null,
    output: r.output as string,
    recap: r.recap as string,
    startedAt: r.started_at as number,
    endedAt: (r.ended_at as number | null) ?? null
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
    agentModel: AGENT_MODELS.includes(r.agent_model as AgentModel) ? (r.agent_model as AgentModel) : DEFAULT_AGENT_MODEL,
    sessionId: (r.session_id as string | null) ?? null,
    model: (r.model as string | null) ?? null,
    costUsd: r.cost_usd as number,
    contextTokens: (r.context_tokens as number | null) ?? 0,
    limitResetsAt: (r.limit_resets_at as number | null) ?? null,
    pinned: Boolean(r.pinned),
    archived: Boolean(r.archived),
    queuePosition: null,
    prUrl: (r.pr_url as string | null) ?? null,
    turnBase: (r.turn_base as string | null) ?? null,
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
      CREATE TABLE IF NOT EXISTS qa_runs (
        id TEXT PRIMARY KEY,
        feature_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        feature_title TEXT NOT NULL,
        command TEXT NOT NULL,
        status TEXT NOT NULL,
        exit_code INTEGER,
        output TEXT NOT NULL DEFAULT '',
        recap TEXT NOT NULL DEFAULT '',
        started_at INTEGER NOT NULL,
        ended_at INTEGER
      );
    `)
    this.addColumns('features', [
      'linear_issue_id TEXT',
      'linear_identifier TEXT',
      'linear_url TEXT',
      'agent_model TEXT',
      'context_tokens INTEGER',
      'pinned INTEGER',
      'archived INTEGER',
      'pr_url TEXT',
      'turn_base TEXT'
    ])
    this.addColumns('projects', ['color TEXT', 'linear_label_id TEXT', 'linear_label_name TEXT', 'commands TEXT', 'templates TEXT', 'worktrees INTEGER', 'qa TEXT'])
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
      .prepare('INSERT INTO projects (id, name, path, color, linear_label_id, linear_label_name, worktrees) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(p.id, p.name, p.path, p.color, p.linearLabel?.id ?? null, p.linearLabel?.name ?? null, p.worktrees ? 1 : 0)
  }

  updateProject(p: Project): void {
    this.db
      .prepare('UPDATE projects SET name = ?, color = ?, linear_label_id = ?, linear_label_name = ?, commands = ?, templates = ?, worktrees = ?, qa = ? WHERE id = ?')
      .run(p.name, p.color, p.linearLabel?.id ?? null, p.linearLabel?.name ?? null, JSON.stringify(p.commands), JSON.stringify(p.templates), p.worktrees ? 1 : 0, JSON.stringify(p.qa), p.id)
  }

  deleteProject(id: string): void {
    this.db.prepare('DELETE FROM qa_runs WHERE project_id = ?').run(id)
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
           linear_issue_id, linear_identifier, linear_url, agent_model, context_tokens)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        f.linear?.url ?? null,
        f.agentModel,
        f.contextTokens
      )
  }

  updateFeature(f: Feature): void {
    this.db
      .prepare(
        `UPDATE features SET title = ?, branch = ?, status = ?, permission_mode = ?, session_id = ?, model = ?, cost_usd = ?,
           limit_resets_at = ?, updated_at = ?, linear_issue_id = ?, linear_identifier = ?, linear_url = ?,
           agent_model = ?, context_tokens = ?, pinned = ?, archived = ?, pr_url = ?, turn_base = ?
         WHERE id = ?`
      )
      .run(
        f.title,
        f.branch,
        f.status,
        f.permissionMode,
        f.sessionId,
        f.model,
        f.costUsd,
        f.limitResetsAt,
        f.updatedAt,
        f.linear?.issueId ?? null,
        f.linear?.identifier ?? null,
        f.linear?.url ?? null,
        f.agentModel,
        f.contextTokens,
        f.pinned ? 1 : 0,
        f.archived ? 1 : 0,
        f.prUrl,
        f.turnBase,
        f.id
      )
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

  /** When the agent or the user last did anything, in epoch milliseconds. App notices do not count: no request went out. */
  lastEventAt(featureId: string): number | null {
    const row = this.db
      .prepare(`SELECT MAX(at) AS at FROM events WHERE feature_id = ? AND json_extract(payload, '$.kind') != 'notice'`)
      .get(featureId) as Row | undefined
    return (row?.at as number | null) ?? null
  }

  /** Cost of every finished turn of every feature still around. */
  listTurnCosts(): TurnCost[] {
    const rows = this.db
      .prepare(
        `SELECT feature_id, at, json_extract(payload, '$.turnCostUsd') AS cost FROM events
         WHERE json_extract(payload, '$.kind') = 'result' AND json_extract(payload, '$.turnCostUsd') > 0`
      )
      .all() as Row[]
    return rows.map((r) => ({ featureId: r.feature_id as string, at: r.at as number, costUsd: r.cost as number }))
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

  listQaRuns(): QaRun[] {
    return (this.db.prepare('SELECT * FROM qa_runs ORDER BY started_at DESC').all() as Row[]).map(toQaRun)
  }

  getQaRun(id: string): QaRun | undefined {
    const row = this.db.prepare('SELECT * FROM qa_runs WHERE id = ?').get(id) as Row | undefined
    return row && toQaRun(row)
  }

  saveQaRun(r: QaRun): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO qa_runs (id, feature_id, project_id, feature_title, command, status, exit_code, output, recap, started_at, ended_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(r.id, r.featureId, r.projectId, r.featureTitle, r.command, r.status, r.exitCode, r.output, r.recap, r.startedAt, r.endedAt)
  }

  /** Keeps the newest runs of a project; a monitor left on for weeks would pile them up. */
  pruneQaRuns(projectId: string, keep: number): void {
    this.db
      .prepare(
        `DELETE FROM qa_runs WHERE project_id = ? AND id NOT IN
           (SELECT id FROM qa_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT ?)`
      )
      .run(projectId, projectId, keep)
  }
}
