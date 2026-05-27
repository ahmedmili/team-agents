import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import {
  ensureConfigFile,
  setAdapterConfig,
  setApiKey,
  readConfigFile,
  maskApiKey,
  setAgentProvider,
  setProvider,
} from "../src/config/store.js";
import {
  loadConfig,
  getModelId,
  resolveProviderForRole,
} from "../src/config/loader.js";

describe("config store", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ai-config-"));
  });

  afterEach(async () => {
    await fs.remove(tmp);
  });

  it("saves openai key via setApiKey", () => {
    setApiKey(tmp, "openai", "sk-test-key-12345678");
    const raw = readConfigFile(tmp);
    expect(raw.keys?.openai).toBe("sk-test-key-12345678");
    expect(raw.provider).toBe("openai");
    const loaded = loadConfig(tmp);
    expect(loaded.provider).toBe("openai");
  });

  it("masks keys for display", () => {
    expect(maskApiKey("sk-abcdefghijklmnop")).toMatch(/^sk-a\.\.\./);
  });

  it("setProvider mock without keys", () => {
    setProvider(tmp, "mock");
    expect(loadConfig(tmp).provider).toBe("mock");
  });

  it("falls back to huggingface when chosen provider has no key", () => {
    ensureConfigFile(tmp);
    setApiKey(tmp, "huggingface", "hf_1234567890");
    const loaded = loadConfig(tmp);
    loaded.provider = "openai";
    expect(resolveProviderForRole(loaded, "backend")).toBe("huggingface");
  });

  it("supports per-agent provider overrides", () => {
    ensureConfigFile(tmp);
    setApiKey(tmp, "openai", "sk-openai-123456");
    setApiKey(tmp, "anthropic", "sk-ant-123456");
    setAgentProvider(tmp, "backend", "anthropic");
    const loaded = loadConfig(tmp);
    expect(resolveProviderForRole(loaded, "backend")).toBe("anthropic");
  });

  it("supports openrouter key and provider selection", () => {
    ensureConfigFile(tmp);
    setApiKey(tmp, "openrouter", "or-test-key");
    setProvider(tmp, "openrouter");
    const loaded = loadConfig(tmp);
    expect(loaded.provider).toBe("openrouter");
    expect(resolveProviderForRole(loaded, "techLead")).toBe("openrouter");
  });

  it("supports puter proxy provider when adapter config is ready", () => {
    ensureConfigFile(tmp);
    setAdapterConfig(tmp, {
      puter: {
        enabled: true,
        mode: "proxy",
        endpoint: "http://127.0.0.1:9999/puter",
        sessionToken: "puter-session-token",
      },
    });
    setProvider(tmp, "puter");
    const loaded = loadConfig(tmp);
    expect(resolveProviderForRole(loaded, "qa")).toBe("puter");
  });

  it("migrates flat models to openai models bucket", () => {
    fs.writeJsonSync(path.join(tmp, ".ai-shell.json"), {
      provider: "openai",
      keys: { openai: "sk-1" },
      models: { techLead: "gpt-flat", backend: "gpt-flat-backend" },
    });
    const loaded = loadConfig(tmp);
    expect(getModelId(loaded, "openai", "techLead")).toBe("gpt-flat");
    expect(getModelId(loaded, "openai", "backend")).toBe("gpt-flat-backend");
  });
});
