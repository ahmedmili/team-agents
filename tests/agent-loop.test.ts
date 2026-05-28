import { describe, expect, it } from "vitest";
import { runAgentLoop } from "../src/core/agent-loop.js";
import type { Agent, AgentInput } from "../src/agents/base.js";

describe("agent loop", () => {
  it("runs single turn when maxTurns is one", async () => {
    const agent: Agent = {
      role: "qa",
      scope: { role: "qa", stacks: ["*"], globs: ["**/*"], write: false },
      run: async () => ({ agentId: "qa", type: "review", data: { summary: "ok", findings: [], approved: true } }),
    };
    const result = await runAgentLoop(agent, baseInput(), { maxTurns: 1 });
    expect(result.trace.turns).toBe(1);
    expect(result.trace.stopReason).toBe("single_turn");
  });

  it("continues message outputs until capped", async () => {
    let calls = 0;
    const agent: Agent = {
      role: "coach",
      scope: { role: "coach", stacks: ["*"], globs: ["**/*"], write: false },
      run: async () => {
        calls += 1;
        if (calls < 2) return { agentId: "coach", type: "message", data: { summary: "keep going" } };
        return { agentId: "coach", type: "review", data: { summary: "done", findings: [], approved: true } };
      },
    };
    const result = await runAgentLoop(agent, baseInput(), { maxTurns: 3 });
    expect(result.trace.turns).toBe(2);
    expect(result.output.type).toBe("review");
  });

  it("stops on repeated message summaries", async () => {
    const agent: Agent = {
      role: "coach",
      scope: { role: "coach", stacks: ["*"], globs: ["**/*"], write: false },
      run: async () => ({ agentId: "coach", type: "message", data: { summary: "same" } }),
    };
    const result = await runAgentLoop(agent, baseInput(), { maxTurns: 3, timeoutMs: 10000 });
    expect(result.trace.stopReason).toBe("repeated_message");
  });
});

function baseInput(): AgentInput {
  return {
    message: "hello",
    profile: {
      root: "/tmp/project",
      name: "project",
      stacks: ["node"],
      treeSummary: "",
      dependencies: "",
      gitStatus: "",
      entrypoints: [],
    },
    config: { provider: "mock" },
  };
}

