import fs from "fs-extra";
import os from "node:os";
import path from "node:path";

export interface WorkspaceEntry {
  cwd: string;
  name: string;
  lastOpenedAt: string;
}

export interface WorkspacesFile {
  lastActive?: string;
  projects: WorkspaceEntry[];
}

const DEFAULT_WORKSPACES_PATH = path.join(
  os.homedir(),
  ".ai-shell",
  "workspaces.json",
);

function workspacesPath(): string {
  return process.env.AI_SHELL_WORKSPACES_PATH ?? DEFAULT_WORKSPACES_PATH;
}

function normalizeCwd(cwd: string): string {
  return path.resolve(cwd).replace(/\\/g, "/");
}

function readFile(): WorkspacesFile {
  const filePath = workspacesPath();
  if (!fs.existsSync(filePath)) {
    return { projects: [] };
  }
  try {
    const data = fs.readJsonSync(filePath) as WorkspacesFile;
    return {
      lastActive: data.lastActive,
      projects: Array.isArray(data.projects) ? data.projects : [],
    };
  } catch {
    return { projects: [] };
  }
}

function writeFile(data: WorkspacesFile): void {
  const filePath = workspacesPath();
  fs.ensureDirSync(path.dirname(filePath));
  fs.writeJsonSync(filePath, data, { spaces: 2 });
}

export function registerWorkspace(cwd: string, projectName?: string): WorkspaceEntry {
  const normalized = normalizeCwd(cwd);
  const name = projectName ?? path.basename(normalized);
  const now = new Date().toISOString();
  const file = readFile();

  const existing = file.projects.find((p) => normalizeCwd(p.cwd) === normalized);
  if (existing) {
    existing.name = name;
    existing.lastOpenedAt = now;
  } else {
    file.projects.push({ cwd: normalized, name, lastOpenedAt: now });
  }

  file.lastActive = normalized;
  file.projects.sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
  writeFile(file);

  return file.projects.find((p) => normalizeCwd(p.cwd) === normalized)!;
}

export function listWorkspaces(): WorkspaceEntry[] {
  const file = readFile();
  return [...file.projects].sort((a, b) =>
    b.lastOpenedAt.localeCompare(a.lastOpenedAt),
  );
}

export function getLastActiveWorkspace(): string | null {
  const file = readFile();
  if (file.lastActive) return normalizeCwd(file.lastActive);
  const first = file.projects[0];
  return first ? normalizeCwd(first.cwd) : null;
}

export function setLastActive(cwd: string): void {
  const normalized = normalizeCwd(cwd);
  const file = readFile();
  file.lastActive = normalized;
  const entry = file.projects.find((p) => normalizeCwd(p.cwd) === normalized);
  if (entry) entry.lastOpenedAt = new Date().toISOString();
  writeFile(file);
}

export function getWorkspacesFilePath(): string {
  return workspacesPath();
}
