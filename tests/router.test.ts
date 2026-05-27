import { describe, it, expect } from "vitest";
import { Router } from "../src/core/router.js";
import { AgentRegistry } from "../src/agents/registry.js";
import { LlmRegistry } from "../src/llm/registry.js";
import type { ProjectProfile } from "../src/schemas/index.js";

const profile: ProjectProfile = {
  root: "/proj",
  name: "proj",
  stacks: ["express", "node"],
  treeSummary: "src/index.ts",
  dependencies: "express",
  entrypoints: ["src/index.ts"],
};

describe("Router", () => {
  const config = {
    agents: { karim: "backend", sara: "architect", flutter: "backend" },
    provider: "mock",
    keys: {},
    models: {},
  } as const;
  const registry = new AgentRegistry(new LlmRegistry(config), config);
  const router = new Router(registry);

  it("routes natural language to tech lead", () => {
    const r = router.route({ kind: "natural", message: "add auth" }, profile);
    expect(r.targetRole).toBe("techLead");
    expect(r.escalated).toBe(false);
  });

  it("routes @karim to backend", () => {
    const r = router.route(
      { kind: "agent", alias: "karim", message: "build API" },
      profile,
    );
    expect(r.targetRole).toBe("backend");
  });

  it("escalates unknown alias to tech lead", () => {
    const r = router.route(
      { kind: "agent", alias: "unknown", message: "do thing" },
      profile,
    );
    expect(r.targetRole).toBe("techLead");
    expect(r.escalated).toBe(true);
  });

  it("escalates backend on flutter-only stack", () => {
    const flutterProfile: ProjectProfile = {
      ...profile,
      stacks: ["flutter"],
    };
    const r = router.route(
      { kind: "agent", alias: "karim", message: "build UI" },
      flutterProfile,
    );
    expect(r.targetRole).toBe("techLead");
    expect(r.escalated).toBe(true);
  });
});
