import { describe, it, expect } from "vitest";
import { extractMemoryEntries } from "../src/memory/capture.js";
import type { AgentOutput } from "../src/schemas/index.js";

describe("extractMemoryEntries", () => {
  it("extracts plan summary, questions, and tasks", () => {
    const output: AgentOutput = {
      agentId: "techLead",
      type: "plan",
      data: {
        summary: "Add auth",
        questions: ["Which provider?"],
        tasks: [
          {
            id: "1",
            agent: "backend",
            description: "Implement JWT",
            status: "pending",
          },
        ],
      },
    };
    const entries = extractMemoryEntries(output);
    expect(entries.some((e) => e.kind === "summary" && e.content === "Add auth")).toBe(
      true,
    );
    expect(entries.some((e) => e.kind === "question")).toBe(true);
    expect(entries.some((e) => e.kind === "decision")).toBe(true);
  });

  it("extracts review findings", () => {
    const output: AgentOutput = {
      agentId: "architect",
      type: "review",
      data: {
        summary: "Looks good",
        findings: [
          { severity: "warn", message: "Tight coupling", filePath: "src/a.ts" },
        ],
        approved: false,
      },
    };
    const entries = extractMemoryEntries(output);
    expect(entries.some((e) => e.kind === "finding" && e.content.includes("warn"))).toBe(
      true,
    );
  });
});
