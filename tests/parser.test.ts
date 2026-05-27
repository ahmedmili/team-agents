import { describe, it, expect } from "vitest";
import { parseInput } from "../src/core/parser.js";

describe("parseInput", () => {
  it("parses slash commands", () => {
    expect(parseInput("/diff")).toEqual({
      kind: "command",
      command: "diff",
      args: [],
    });
    expect(parseInput("/apply all")).toEqual({
      kind: "command",
      command: "apply",
      args: ["all"],
    });
  });

  it("parses @agent messages", () => {
    expect(parseInput("@karim implement webhook")).toEqual({
      kind: "agent",
      alias: "karim",
      message: "implement webhook",
    });
  });

  it("parses natural language", () => {
    expect(parseInput("add JWT auth")).toEqual({
      kind: "natural",
      message: "add JWT auth",
    });
  });
});
