import type { AgentOutput, PlanOutput, PatchOutput, ReviewOutput } from "../schemas/index.js";
import type { AgentRole } from "../schemas/index.js";

export interface HandoffEntry {
  agent: AgentRole;
  type: AgentOutput["type"];
  brief: string;
  at: string;
}

const MAX_BLOCK_CHARS = 2000;

export function formatAgentOutputBrief(output: AgentOutput): string {
  switch (output.type) {
    case "plan": {
      const d = output.data as PlanOutput;
      const tasks = d.tasks?.length ?? 0;
      return `${d.summary?.slice(0, 200) || "(no summary)"} (${tasks} tasks)`;
    }
    case "review": {
      const d = output.data as ReviewOutput;
      const n = d.findings?.length ?? 0;
      return `${d.summary?.slice(0, 200) || "(no summary)"} — ${n} findings, approved=${d.approved}`;
    }
    case "patch": {
      const d = output.data as PatchOutput;
      const n = d.patches?.length ?? 0;
      return `${d.summary?.slice(0, 200) || "(no summary)"} — ${n} patch(es)`;
    }
    default:
      return JSON.stringify(output.data).slice(0, 200);
  }
}

export function formatHandoffBlock(entries: HandoffEntry[]): string {
  if (!entries.length) return "";

  const lines: string[] = ["Agent team — outputs from this run:"];
  let size = lines[0]!.length;

  for (const e of entries) {
    const line = `- [${e.agent}] ${e.type}: ${e.brief}`;
    if (size + line.length + 1 > MAX_BLOCK_CHARS) break;
    lines.push(line);
    size += line.length + 1;
  }

  return lines.join("\n");
}

export function handoffFromAgentOutput(
  output: AgentOutput,
): HandoffEntry {
  return {
    agent: output.agentId,
    type: output.type,
    brief: formatAgentOutputBrief(output),
    at: new Date().toISOString(),
  };
}
