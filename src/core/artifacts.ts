import fs from "fs-extra";
import path from "node:path";

export interface AgentArtifactInfo {
  fileName: string;
  relativePath: string;
  role: string;
  mtimeMs: number;
}

/** List agent markdown artifacts for a session, newest first. */
export function listAgentArtifacts(
  projectRoot: string,
  sessionId: string,
): AgentArtifactInfo[] {
  const dir = path.join(projectRoot, ".ai-shell", "agents", sessionId);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  const items: AgentArtifactInfo[] = [];

  for (const fileName of files) {
    const fullPath = path.join(dir, fileName);
    const stat = fs.statSync(fullPath);
    const roleMatch = fileName.match(/-([a-zA-Z]+)\.md$/);
    items.push({
      fileName,
      relativePath: path
        .relative(projectRoot, fullPath)
        .replace(/\\/g, "/"),
      role: roleMatch?.[1] ?? "unknown",
      mtimeMs: stat.mtimeMs,
    });
  }

  return items.sort((a, b) => b.mtimeMs - a.mtimeMs);
}
