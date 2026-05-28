import { describe, it, expect } from "vitest";
import { formatProjectMemoryBlock } from "../src/memory/context.js";
import type { ProjectMemoryEntry } from "../src/memory/types.js";

describe("formatProjectMemoryBlock", () => {
  it("formats entries with priority and truncates long output", () => {
    const entries: ProjectMemoryEntry[] = [
      {
        id: "1",
        cwd: "/p",
        kind: "summary",
        content: "Old summary",
        sourceSessionId: null,
        sourceAgent: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "2",
        cwd: "/p",
        kind: "finding",
        content: "Critical issue in auth",
        sourceSessionId: "s1",
        sourceAgent: "qa",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ];
    const block = formatProjectMemoryBlock(entries);
    expect(block).toContain("Prior knowledge");
    expect(block).toContain("finding");
    expect(block.indexOf("finding")).toBeLessThan(block.indexOf("summary"));
  });

  it("returns empty string for no entries", () => {
    expect(formatProjectMemoryBlock([])).toBe("");
  });
});
