import type { ProjectMemoryEntry, ProjectMemoryKind } from "./types.js";

const MAX_BLOCK_CHARS = 3000;

const PRIORITY_KINDS: ProjectMemoryKind[] = [
  "finding",
  "decision",
  "question",
  "convention",
  "summary",
];

/** Format project memory for injection into agent prompts. */
export function formatProjectMemoryBlock(entries: ProjectMemoryEntry[]): string {
  if (!entries.length) return "";

  const sorted = [...entries].sort((a, b) => {
    const ka = PRIORITY_KINDS.indexOf(a.kind);
    const kb = PRIORITY_KINDS.indexOf(b.kind);
    if (ka !== kb) return ka - kb;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const lines: string[] = [];
  let size = 0;

  for (const e of sorted) {
    const agent = e.sourceAgent ? `[${e.sourceAgent}] ` : "";
    const line = `- (${e.kind}) ${agent}${e.content}`;
    if (size + line.length + 1 > MAX_BLOCK_CHARS) break;
    lines.push(line);
    size += line.length + 1;
  }

  if (!lines.length) return "";

  return [
    "Prior knowledge from this project (earlier sessions):",
    ...lines,
  ].join("\n");
}
