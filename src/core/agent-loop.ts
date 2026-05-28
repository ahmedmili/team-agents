import type { Agent } from "../agents/base.js";
import type { AgentInput } from "../agents/base.js";
import type { AgentOutput } from "../schemas/index.js";
import type { LoopConfig } from "../config/types.js";

export interface LoopTrace {
  turns: number;
  stopReason:
    | "single_turn"
    | "max_turns"
    | "completed"
    | "timeout"
    | "repeated_message";
  lastOutputType: AgentOutput["type"];
}

export interface LoopRunResult {
  output: AgentOutput;
  trace: LoopTrace;
}

export async function runAgentLoop(
  agent: Agent,
  input: AgentInput,
  config: LoopConfig | undefined,
): Promise<LoopRunResult> {
  const maxTurns = Math.max(1, config?.maxTurns ?? 1);
  const timeoutMs = Math.max(1000, config?.timeoutMs ?? 30000);
  const startedAt = Date.now();
  const seenSummaries = new Set<string>();

  let turns = 0;
  let currentInput = input;
  let output = await agent.run(currentInput);
  turns += 1;
  if (output.type === "message") {
    const text = typeof (output.data as { summary?: string }).summary === "string"
      ? ((output.data as { summary?: string }).summary ?? "")
      : JSON.stringify(output.data);
    seenSummaries.add(text.slice(0, 300));
  }

  if (maxTurns <= 1 || output.type !== "message") {
    return {
      output,
      trace: {
        turns,
        stopReason: "single_turn",
        lastOutputType: output.type,
      },
    };
  }

  while (turns < maxTurns && output.type === "message") {
    if (Date.now() - startedAt >= timeoutMs) {
      return {
        output,
        trace: {
          turns,
          stopReason: "timeout",
          lastOutputType: output.type,
        },
      };
    }
    const summary =
      typeof (output.data as { summary?: string }).summary === "string"
        ? (output.data as { summary?: string }).summary ?? ""
        : JSON.stringify(output.data);
    currentInput = {
      ...input,
      message: `${input.message}\n\nRefine previous response:\n${summary.slice(0, 500)}`,
    };
    output = await agent.run(currentInput);
    turns += 1;
    if (output.type === "message") {
      const nextSummary =
        typeof (output.data as { summary?: string }).summary === "string"
          ? ((output.data as { summary?: string }).summary ?? "")
          : JSON.stringify(output.data);
      const fingerprint = nextSummary.slice(0, 300);
      if (seenSummaries.has(fingerprint)) {
        return {
          output,
          trace: {
            turns,
            stopReason: "repeated_message",
            lastOutputType: output.type,
          },
        };
      }
      seenSummaries.add(fingerprint);
    }
  }

  return {
    output,
    trace: {
      turns,
      stopReason: output.type === "message" ? "max_turns" : "completed",
      lastOutputType: output.type,
    },
  };
}

