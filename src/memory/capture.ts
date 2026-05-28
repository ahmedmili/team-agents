import type { AgentOutput, PlanOutput, PatchOutput, ReviewOutput } from "../schemas/index.js";
import type { AppendProjectMemoryInput } from "./types.js";

/** Rule-based extraction of durable memory from agent outputs (no extra LLM call). */
export function extractMemoryEntries(output: AgentOutput): AppendProjectMemoryInput[] {
  const entries: AppendProjectMemoryInput[] = [];
  const sourceAgent = output.agentId;

  switch (output.type) {
    case "plan": {
      const d = output.data as PlanOutput;
      if (d.summary?.trim()) {
        entries.push({
          kind: "summary",
          content: d.summary.trim(),
          sourceAgent,
        });
      }
      for (const q of d.questions ?? []) {
        if (q.trim()) {
          entries.push({ kind: "question", content: q.trim(), sourceAgent });
        }
      }
      for (const t of d.tasks ?? []) {
        if (t.description?.trim()) {
          entries.push({
            kind: "decision",
            content: `[${t.agent}] ${t.description.trim()}`,
            sourceAgent,
          });
        }
      }
      break;
    }
    case "review": {
      const d = output.data as ReviewOutput;
      if (d.summary?.trim()) {
        entries.push({
          kind: "summary",
          content: d.summary.trim(),
          sourceAgent,
        });
      }
      for (const f of d.findings ?? []) {
        const loc = f.filePath ? ` (${f.filePath})` : "";
        entries.push({
          kind: "finding",
          content: `[${f.severity}] ${f.message}${loc}`,
          sourceAgent,
        });
      }
      break;
    }
    case "patch": {
      const d = output.data as PatchOutput;
      if (d.summary?.trim()) {
        entries.push({
          kind: "summary",
          content: d.summary.trim(),
          sourceAgent,
        });
      }
      for (const p of d.patches ?? []) {
        const desc = p.description?.trim() ?? "patch proposed";
        entries.push({
          kind: "decision",
          content: `Patch ${p.filePath}: ${desc}`,
          sourceAgent,
        });
      }
      break;
    }
    case "message": {
      const d = output.data as { summary?: string };
      if (d.summary?.trim()) {
        entries.push({
          kind: "summary",
          content: d.summary.trim(),
          sourceAgent,
        });
      }
      break;
    }
  }

  return entries;
}
