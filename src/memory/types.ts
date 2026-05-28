import type { AgentRole } from "../schemas/index.js";

export type ProjectMemoryKind =
  | "summary"
  | "decision"
  | "finding"
  | "convention"
  | "question";

export interface ProjectMemoryEntry {
  id: string;
  cwd: string;
  kind: ProjectMemoryKind;
  content: string;
  sourceSessionId: string | null;
  sourceAgent: AgentRole | null;
  createdAt: string;
}

export interface AppendProjectMemoryInput {
  kind: ProjectMemoryKind;
  content: string;
  sourceSessionId?: string;
  sourceAgent?: AgentRole;
}

export const DEFAULT_MAX_ENTRIES_PER_PROJECT = 200;
