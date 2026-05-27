import { describe, it, expect } from "vitest";
import { LlmRegistry } from "../src/llm/registry.js";
import type { AiShellConfig } from "../src/config/types.js";

describe("LlmRegistry", () => {
  it("resolves provider per role using override", () => {
    const config: AiShellConfig = {
      provider: "openai",
      keys: {
        openai: "sk-openai",
        anthropic: "sk-ant",
      },
      agentProviders: {
        backend: "anthropic",
      },
      models: {
        openai: { backend: "gpt-4o-mini" },
        anthropic: { backend: "claude-3-5-haiku-20241022" },
      },
    };

    const registry = new LlmRegistry(config);
    expect(registry.getProviderNameForRole("backend")).toBe("anthropic");
    expect(registry.getModelForRole("backend")).toBe(
      "claude-3-5-haiku-20241022",
    );
  });

  it("falls back to mock when no keys exist", () => {
    const config: AiShellConfig = {
      provider: "openai",
      keys: {},
      models: {},
    };
    const registry = new LlmRegistry(config);
    expect(registry.getProviderNameForRole("techLead")).toBe("mock");
    expect(registry.getProvider("mock").name).toBe("mock");
  });

  it("resolves openrouter from key availability", () => {
    const config: AiShellConfig = {
      provider: "openrouter",
      keys: { openrouter: "or-key" },
      models: {
        openrouter: { backend: "openai/gpt-4o-mini" },
      },
    };
    const registry = new LlmRegistry(config);
    expect(registry.getProviderNameForRole("backend")).toBe("openrouter");
    expect(registry.getModelForRole("backend")).toBe("openai/gpt-4o-mini");
  });
});
