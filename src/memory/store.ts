import Database from "better-sqlite3";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import type { PatchRecord, ProjectProfile } from "../schemas/index.js";
import type { AgentRole } from "../schemas/index.js";
import type { LlmProviderName } from "../config/types.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
    `);
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
