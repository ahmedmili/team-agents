import { describe, it, expect } from "vitest";
import {
  formatAgentOutputBrief,
  formatHandoffBlock,
  handoffFromAgentOutput,
} from "../src/core/handoff.js";
import type { AgentOutput } from "../src/schemas/index.js";

describe("handoff formatting", () => {
  it("formats plan output brief", () => {
    const output: AgentOutput = {
      agentId: "techLead",
      type: "plan",
      data: {
        summary: "Build auth module",
        tasks: [{ agent: "backend", description: "API", status: "pending" }],
        questions: [],
      },
    };
    const brief = formatAgentOutputBrief(output);
    expect(brief).toContain("Build auth module");
    expect(brief).toContain("1 tasks");
  });

  it("builds handoff block with cap", () => {
    const entries = Array.from({ length: 50 }, (_, i) =>
      handoffFromAgentOutput({
        agentId: "qa",
        type: "review",
        data: {
          summary: `Finding batch ${i} `.repeat(20),
          approved: true,
          findings: [],
        },
      }),
    );
    const block = formatHandoffBlock(entries);
    expect(block.length).toBeLessThanOrEqual(2000);
    expect(block).toContain("Agent team");
  });

  it("creates handoff entry from agent output", () => {
    const output: AgentOutput = {
      agentId: "architect",
      type: "review",
      data: {
        summary: "Looks good",
        approved: true,
        findings: [{ severity: "info", message: "ok" }],
      },
    };
    const entry = handoffFromAgentOutput(output);
    expect(entry.agent).toBe("architect");
    expect(entry.type).toBe("review");
    expect(entry.brief).toContain("Looks good");
  });
});
