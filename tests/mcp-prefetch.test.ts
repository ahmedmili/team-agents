import { describe, it, expect } from "vitest";
import {
  fillRefRepo,
  parseGitHubRefs,
} from "../src/mcp/refs.js";
import { resolveMcpEnv } from "../src/mcp/env.js";

describe("mcp prefetch heuristics", () => {
  it("parses issue and PR URLs", () => {
    const refs = parseGitHubRefs(
      "Fix https://github.com/acme/app/issues/42 and https://github.com/acme/app/pull/7",
    );
    expect(refs.some((r) => r.kind === "issue" && r.number === 42)).toBe(true);
    expect(refs.some((r) => r.kind === "pull" && r.number === 7)).toBe(true);
  });

  it("parses owner/repo#number", () => {
    const refs = parseGitHubRefs("see acme/api#99");
    expect(refs[0]).toMatchObject({
      kind: "issue",
      owner: "acme",
      repo: "api",
      number: 99,
    });
  });

  it("fills bare issue number from default repo", () => {
    const filled = fillRefRepo(
      { kind: "issue", owner: "", repo: "", number: 5 },
      { owner: "acme", repo: "api" },
    );
    expect(filled).toEqual({
      kind: "issue",
      owner: "acme",
      repo: "api",
      number: 5,
    });
  });

  it("resolves ${keys.github} in MCP env", () => {
    const env = resolveMcpEnv(
      { GITHUB_PERSONAL_ACCESS_TOKEN: "${keys.github}" },
      { github: "ghp_test" },
    );
    expect(env?.GITHUB_PERSONAL_ACCESS_TOKEN).toBe("ghp_test");
  });
});
