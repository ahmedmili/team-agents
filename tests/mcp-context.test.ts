import { describe, it, expect } from "vitest";
import { formatMcpContextBlock, stringifyToolResult } from "../src/mcp/context.js";

describe("mcp context formatting", () => {
  it("formats empty results as empty string", () => {
    expect(formatMcpContextBlock([])).toBe("");
  });

  it("caps block size", () => {
    const results = Array.from({ length: 100 }, (_, i) => ({
      source: "github",
      label: `item-${i}`,
      content: "x".repeat(100),
    }));
    expect(formatMcpContextBlock(results).length).toBeLessThanOrEqual(2000);
  });

  it("stringifies tool content array", () => {
    const text = stringifyToolResult({
      content: [{ type: "text", text: "hello issue" }],
    });
    expect(text).toContain("hello issue");
  });
});
