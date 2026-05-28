import { describe, it, expect } from "vitest";
import { parsePrArgs } from "../src/git/pr.js";

describe("pr workflow", () => {
  it("parses pr CLI flags", () => {
    const flags = parsePrArgs([
      "--title",
      "My PR",
      "--branch",
      "feature/x",
      "--draft",
      "--yes",
    ]);
    expect(flags.title).toBe("My PR");
    expect(flags.branch).toBe("feature/x");
    expect(flags.draft).toBe(true);
    expect(flags.yes).toBe(true);
  });

  it("defaults dry-run flags off until set", () => {
    const flags = parsePrArgs([]);
    expect(flags.yes).toBe(false);
    expect(flags.dryRun).toBe(false);
  });
});
