import Database from "better-sqlite3";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import type { HandoffEntry } from "../core/handoff.js";
import type { PatchRecord, PlanOutput, ProjectProfile } from "../schemas/index.js";
import type { AgentRole } from "../schemas/index.js";
import type { LlmProviderName } from "../config/types.js";
import type {
  AppendProjectMemoryInput,
  ProjectMemoryEntry,
  ProjectMemoryKind,
} from "./types.js";
import { DEFAULT_MAX_ENTRIES_PER_PROJECT } from "./types.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type { ProjectMemoryEntry, ProjectMemoryKind, AppendProjectMemoryInput };
export { DEFAULT_MAX_ENTRIES_PER_PROJECT };

export interface SessionRow {
  id: string;
  cwd: string;
  project_name: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent_id: string | null;
  created_at: string;
}

export interface ProviderEventRow {
  id: string;
  session_id: string;
  provider: LlmProviderName;
  role: AgentRole;
  model: string;
  status: "ok" | "error";
  latency_ms: number;
  error_message: string | null;
  created_at: string;
}

export class MemoryStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const dir = path.join(os.homedir(), ".ai-shell");
    fs.ensureDirSync(dir);
    const file = dbPath ?? path.join(dir, "memory.db");
    this.db = new Database(file);
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        cwd TEXT NOT NULL,
        project_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        agent_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );
      CREATE TABLE IF NOT EXISTS patches (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        unified_diff TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        backup_path TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );
      CREATE TABLE IF NOT EXISTS project_profiles (
        session_id TEXT PRIMARY KEY,
        profile_json TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );
      CREATE TABLE IF NOT EXISTS provider_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        role TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        error_message TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_cwd ON sessions(cwd);
      CREATE INDEX IF NOT EXISTS idx_patches_session ON patches(session_id);
      CREATE INDEX IF NOT EXISTS idx_provider_events_session ON provider_events(session_id);
      CREATE TABLE IF NOT EXISTS session_state (
        session_id TEXT PRIMARY KEY,
        plan_json TEXT,
        memory_summary TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );
      CREATE TABLE IF NOT EXISTS project_memory (
        id TEXT PRIMARY KEY,
        cwd TEXT NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        source_session_id TEXT,
        source_agent TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_project_memory_cwd ON project_memory(cwd);
    `);
    try {
      this.db.exec(`ALTER TABLE session_state ADD COLUMN handoff_json TEXT`);
    } catch {
      // column already exists
    }
  }

  private normalizeCwd(cwd: string): string {
    return path.resolve(cwd).replace(/\\/g, "/");
  }

  getOrCreateSession(cwd: string, projectName: string): SessionRow {
    const cutoff = new Date(Date.now() - SESSION_TTL_MS).toISOString();
    const existing = this.db
      .prepare(
        `SELECT * FROM sessions WHERE cwd = ? AND updated_at > ? ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(cwd, cutoff) as SessionRow | undefined;

    if (existing) {
      this.touchSession(existing.id);
      return existing;
    }

    const now = new Date().toISOString();
    const row: SessionRow = {
      id: uuidv4(),
      cwd,
      project_name: projectName,
      created_at: now,
      updated_at: now,
    };
    this.db
      .prepare(
        `INSERT INTO sessions (id, cwd, project_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(row.id, row.cwd, row.project_name, row.created_at, row.updated_at);
    return row;
  }

  touchSession(sessionId: string): void {
    this.db
      .prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), sessionId);
  }

  saveMessage(
    sessionId: string,
    role: MessageRow["role"],
    content: string,
    agentId?: AgentRole | null,
  ): void {
    this.db
      .prepare(
        `INSERT INTO messages (id, session_id, role, content, agent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        uuidv4(),
        sessionId,
        role,
        content,
        agentId ?? null,
        new Date().toISOString(),
      );
    this.touchSession(sessionId);
  }

  getMessages(sessionId: string, limit = 50): MessageRow[] {
    return this.db
      .prepare(
        `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?`,
      )
      .all(sessionId, limit) as MessageRow[];
  }

  saveProjectProfile(sessionId: string, profile: ProjectProfile): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO project_profiles (session_id, profile_json) VALUES (?, ?)`,
      )
      .run(sessionId, JSON.stringify(profile));
  }

  getProjectProfile(sessionId: string): ProjectProfile | null {
    const row = this.db
      .prepare(`SELECT profile_json FROM project_profiles WHERE session_id = ?`)
      .get(sessionId) as { profile_json: string } | undefined;
    return row ? (JSON.parse(row.profile_json) as ProjectProfile) : null;
  }

  saveSessionPlan(sessionId: string, plan: PlanOutput): void {
    const existing = this.getSessionStateRow(sessionId);
    this.db
      .prepare(
        `INSERT INTO session_state (session_id, plan_json, memory_summary, handoff_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           plan_json = excluded.plan_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        sessionId,
        JSON.stringify(plan),
        existing?.memory_summary ?? null,
        existing?.handoff_json ?? null,
        new Date().toISOString(),
      );
    this.touchSession(sessionId);
  }

  saveSessionHandoffs(sessionId: string, handoffs: HandoffEntry[]): void {
    const existing = this.getSessionStateRow(sessionId);
    this.db
      .prepare(
        `INSERT INTO session_state (session_id, plan_json, memory_summary, handoff_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           handoff_json = excluded.handoff_json,
           updated_at = excluded.updated_at`,
      )
      .run(
        sessionId,
        existing?.plan_json ?? null,
        existing?.memory_summary ?? null,
        JSON.stringify(handoffs),
        new Date().toISOString(),
      );
    this.touchSession(sessionId);
  }

  getSessionHandoffs(sessionId: string): HandoffEntry[] {
    const row = this.getSessionStateRow(sessionId);
    if (!row?.handoff_json) return [];
    try {
      return JSON.parse(row.handoff_json) as HandoffEntry[];
    } catch {
      return [];
    }
  }

  getSessionPlan(sessionId: string): PlanOutput | null {
    const row = this.getSessionStateRow(sessionId);
    if (!row?.plan_json) return null;
    return JSON.parse(row.plan_json) as PlanOutput;
  }

  updateSessionSummary(sessionId: string, summary: string): void {
    const existing = this.getSessionStateRow(sessionId);
    this.db
      .prepare(
        `INSERT INTO session_state (session_id, plan_json, memory_summary, handoff_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           memory_summary = excluded.memory_summary,
           updated_at = excluded.updated_at`,
      )
      .run(
        sessionId,
        existing?.plan_json ?? null,
        summary.slice(0, 4000),
        existing?.handoff_json ?? null,
        new Date().toISOString(),
      );
    this.touchSession(sessionId);
  }

  getSessionSummary(sessionId: string): string | null {
    const row = this.getSessionStateRow(sessionId);
    return row?.memory_summary ?? null;
  }

  appendProjectMemory(
    cwd: string,
    entry: AppendProjectMemoryInput,
    maxEntries = DEFAULT_MAX_ENTRIES_PER_PROJECT,
  ): ProjectMemoryEntry | null {
    const normalized = this.normalizeCwd(cwd);
    const content = entry.content.trim();
    if (!content) return null;

    if (this.hasRecentDuplicate(normalized, entry.kind, content)) {
      return null;
    }

    const row: ProjectMemoryEntry = {
      id: uuidv4(),
      cwd: normalized,
      kind: entry.kind,
      content: content.slice(0, 2000),
      sourceSessionId: entry.sourceSessionId ?? null,
      sourceAgent: entry.sourceAgent ?? null,
      createdAt: new Date().toISOString(),
    };

    this.db
      .prepare(
        `INSERT INTO project_memory (id, cwd, kind, content, source_session_id, source_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.cwd,
        row.kind,
        row.content,
        row.sourceSessionId,
        row.sourceAgent,
        row.createdAt,
      );

    this.pruneProjectMemory(normalized, maxEntries);
    return row;
  }

  hasRecentDuplicate(
    cwd: string,
    kind: ProjectMemoryKind,
    content: string,
    lookback = 50,
  ): boolean {
    const normalized = this.normalizeCwd(cwd);
    const recent = this.getProjectMemories(normalized, lookback);
    const needle = content.trim().slice(0, 2000);
    return recent.some((r) => r.kind === kind && r.content === needle);
  }

  getProjectMemories(
    cwd: string,
    limit = 50,
    kinds?: ProjectMemoryKind[],
  ): ProjectMemoryEntry[] {
    const normalized = this.normalizeCwd(cwd);
    if (kinds?.length) {
      const placeholders = kinds.map(() => "?").join(", ");
      return (
        this.db
          .prepare(
            `SELECT * FROM project_memory WHERE cwd = ? AND kind IN (${placeholders})
             ORDER BY created_at DESC LIMIT ?`,
          )
          .all(normalized, ...kinds, limit) as ProjectMemoryDbRow[]
      ).map(rowToProjectMemory);
    }
    return (
      this.db
        .prepare(
          `SELECT * FROM project_memory WHERE cwd = ? ORDER BY created_at DESC LIMIT ?`,
        )
        .all(normalized, limit) as ProjectMemoryDbRow[]
    ).map(rowToProjectMemory);
  }

  getProjectMemoryCount(cwd: string): number {
    const normalized = this.normalizeCwd(cwd);
    const row = this.db
      .prepare(`SELECT COUNT(*) AS count FROM project_memory WHERE cwd = ?`)
      .get(normalized) as { count: number };
    return row.count;
  }

  clearProjectMemory(cwd: string): number {
    const normalized = this.normalizeCwd(cwd);
    const result = this.db
      .prepare(`DELETE FROM project_memory WHERE cwd = ?`)
      .run(normalized);
    return result.changes;
  }

  private pruneProjectMemory(cwd: string, maxEntries: number): void {
    const count = this.getProjectMemoryCount(cwd);
    if (count <= maxEntries) return;

    const excess = count - maxEntries;
    this.db
      .prepare(
        `DELETE FROM project_memory WHERE id IN (
           SELECT id FROM project_memory WHERE cwd = ?
           ORDER BY created_at ASC LIMIT ?
         )`,
      )
      .run(cwd, excess);
  }

  private getSessionStateRow(sessionId: string): {
    plan_json: string | null;
    memory_summary: string | null;
    handoff_json: string | null;
  } | null {
    const row = this.db
      .prepare(
        `SELECT plan_json, memory_summary, handoff_json FROM session_state WHERE session_id = ?`,
      )
      .get(sessionId) as
      | {
          plan_json: string | null;
          memory_summary: string | null;
          handoff_json: string | null;
        }
      | undefined;
    return row ?? null;
  }

  savePatch(record: PatchRecord): void {
    this.db
      .prepare(
        `INSERT INTO patches (id, session_id, agent_id, file_path, unified_diff, description, status, created_at, backup_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.sessionId,
        record.agentId,
        record.filePath,
        record.unifiedDiff,
        record.description ?? null,
        record.status,
        record.createdAt,
        record.backupPath ?? null,
      );
  }

  updatePatchStatus(
    id: string,
    status: PatchRecord["status"],
    backupPath?: string,
  ): void {
    if (backupPath) {
      this.db
        .prepare(
          `UPDATE patches SET status = ?, backup_path = ? WHERE id = ?`,
        )
        .run(status, backupPath, id);
    } else {
      this.db
        .prepare(`UPDATE patches SET status = ? WHERE id = ?`)
        .run(status, id);
    }
  }

  getPatches(
    sessionId: string,
    status?: PatchRecord["status"],
  ): PatchRecord[] {
    if (status) {
      return (
        this.db
          .prepare(
            `SELECT * FROM patches WHERE session_id = ? AND status = ? ORDER BY created_at ASC`,
          )
          .all(sessionId, status) as PatchDbRow[]
      ).map(rowToPatch);
    }
    return (
      this.db
        .prepare(
          `SELECT * FROM patches WHERE session_id = ? ORDER BY created_at ASC`,
        )
        .all(sessionId) as PatchDbRow[]
    ).map(rowToPatch);
  }

  getPatchById(id: string): PatchRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM patches WHERE id = ?`)
      .get(id) as PatchDbRow | undefined;
    return row ? rowToPatch(row) : null;
  }

  saveProviderEvent(event: Omit<ProviderEventRow, "id" | "created_at">): void {
    this.db
      .prepare(
        `INSERT INTO provider_events (id, session_id, provider, role, model, status, latency_ms, error_message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        uuidv4(),
        event.session_id,
        event.provider,
        event.role,
        event.model,
        event.status,
        event.latency_ms,
        event.error_message,
        new Date().toISOString(),
      );
  }

  getProviderEvents(sessionId: string, limit = 200): ProviderEventRow[] {
    return this.db
      .prepare(
        `SELECT * FROM provider_events WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(sessionId, limit) as ProviderEventRow[];
  }

  getProviderMetrics(sessionId: string): Array<{
    provider: string;
    calls: number;
    errors: number;
    avg_latency_ms: number;
  }> {
    return this.db
      .prepare(
        `SELECT provider,
                COUNT(*) AS calls,
                SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
                ROUND(AVG(latency_ms), 2) AS avg_latency_ms
         FROM provider_events
         WHERE session_id = ?
         GROUP BY provider
         ORDER BY calls DESC`,
      )
      .all(sessionId) as Array<{
      provider: string;
      calls: number;
      errors: number;
      avg_latency_ms: number;
    }>;
  }

  getRecentSessions(limit = 20): SessionRow[] {
    return this.db
      .prepare(`SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?`)
      .all(limit) as SessionRow[];
  }

  getRecentMessages(limit = 100): MessageRow[] {
    return this.db
      .prepare(`SELECT * FROM messages ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as MessageRow[];
  }

  getRecentPatches(limit = 100): PatchRecord[] {
    return (
      this.db
        .prepare(`SELECT * FROM patches ORDER BY created_at DESC LIMIT ?`)
        .all(limit) as PatchDbRow[]
    ).map(rowToPatch);
  }

  close(): void {
    this.db.close();
  }
}

interface PatchDbRow {
  id: string;
  session_id: string;
  agent_id: string;
  file_path: string;
  unified_diff: string;
  description: string | null;
  status: string;
  created_at: string;
  backup_path: string | null;
}

interface ProjectMemoryDbRow {
  id: string;
  cwd: string;
  kind: string;
  content: string;
  source_session_id: string | null;
  source_agent: string | null;
  created_at: string;
}

function rowToProjectMemory(row: ProjectMemoryDbRow): ProjectMemoryEntry {
  return {
    id: row.id,
    cwd: row.cwd,
    kind: row.kind as ProjectMemoryKind,
    content: row.content,
    sourceSessionId: row.source_session_id,
    sourceAgent: row.source_agent as AgentRole | null,
    createdAt: row.created_at,
  };
}

function rowToPatch(row: PatchDbRow): PatchRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    agentId: row.agent_id,
    filePath: row.file_path,
    unifiedDiff: row.unified_diff,
    description: row.description ?? undefined,
    status: row.status as PatchRecord["status"],
    createdAt: row.created_at,
    backupPath: row.backup_path ?? undefined,
  };
}
