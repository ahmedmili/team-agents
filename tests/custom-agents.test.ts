import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../src/config/loader.js";
import { LlmRegistry } from "../src/llm/registry.js";
import { AgentRegistry } from "../src/agents/registry.js";

describe("custom agents", () => {
  let root: string;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-custom-"));
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  it("loads custom agent definitions with defaults", async () => {
    await fs.writeJson(path.join(root, ".ai-shell.json"), {
      provider: "mock",
      customAgents: {
        nina: {
          role: "security",
          systemPrompt: "Security review",
        },
      },
      agents: {
        lead: "techLead",
      },
    });
    const config = loadConfig(root);
    expect(config.customAgents?.nina?.role).toBe("security");
    expect(config.customAgents?.nina?.outputType).toBe("message");
    expect(config.customAgents?.nina?.policy?.allowWrite).toBe(false);
  });

  it("resolves aliases for custom agents in registry", async () => {
    await fs.writeJson(path.join(root, ".ai-shell.json"), {
      provider: "mock",
      customAgents: {
        nina: {
          role: "security",
          outputType: "review",
          systemPrompt: "Security review",
        },
      },
      agents: {
        lead: "techLead",
      },
    });
    const config = loadConfig(root);
    const llm = new LlmRegistry(config);
    const registry = new AgentRegistry(llm, config);
    expect(registry.resolveAlias("nina")).toBe("security");
    expect(registry.listAliases().some((a) => a.alias === "nina" && a.kind === "custom")).toBe(true);
  });

  it("skips invalid or reserved custom agent roles", async () => {
    await fs.writeJson(path.join(root, ".ai-shell.json"), {
      provider: "mock",
      customAgents: {
        bad1: { role: "", systemPrompt: "x" },
        backend: { role: "backend", systemPrompt: "x" },
        dupA: { role: "security", systemPrompt: "x" },
        dupB: { role: "security", systemPrompt: "x" },
      },
    });
    const config = loadConfig(root);
    expect(config.customAgents?.bad1).toBeUndefined();
    expect(config.customAgents?.backend).toBeUndefined();
    expect(config.customAgents?.dupa).toBeDefined();
    expect(config.customAgents?.dupb).toBeUndefined();
  });
});

