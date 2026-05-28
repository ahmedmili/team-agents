import { describe, it, expect } from "vitest";
import {
  formatCiRunsTable,
  messageMentionsCi,
  type WorkflowRun,
} from "../src/git/ci.js";

describe("ci helpers", () => {
  it("detects CI-related messages", () => {
    expect(messageMentionsCi("the GitHub Actions build failed")).toBe(true);
    expect(messageMentionsCi("add a button")).toBe(false);
  });

  it("formats workflow run table", () => {
    const runs: WorkflowRun[] = [
      {
        databaseId: 1,
        name: "CI",
        status: "completed",
        conclusion: "failure",
        url: "https://example.com/run/1",
        createdAt: "2026-05-28T00:00:00Z",
        headBranch: "main",
      },
    ];
    const lines = formatCiRunsTable(runs);
    expect(lines.join("\n")).toContain("#1");
    expect(lines.join("\n")).toContain("CI");
  });

  it("handles empty runs", () => {
    const lines = formatCiRunsTable([]);
    expect(lines[0]).toContain("No workflow runs");
  });
});
