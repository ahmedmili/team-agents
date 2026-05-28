import fs from "fs-extra";
import path from "node:path";
import type {
  AiShellConfig,
  FlatModelsConfig,
  LlmProviderName,
  ProviderModelsConfig,
} from "./types.js";
import {
  DEFAULT_AGENT_ALIASES,
  DEFAULT_AGENT_SCOPES,
} from "./types.js";
import type { AgentRole } from "../schemas/index.js";
import {
  CONFIG_FILENAME,
  ensureConfigFile,
  readConfigFile,
} from "./store.js";

export { CONFIG_FILENAME };

export function loadConfig(projectRoot: string): AiShellConfig {
  const fileConfig = fs.existsSync(path.join(projectRoot, CONFIG_FILENAME))
    ? readConfigFile(projectRoot)
    : {};

  const maxSteps = fileConfig.maxSteps ?? 5;
  const provider = resolveProvider(fileConfig);

  const agents: Record<string, AgentRole> = { ...DEFAULT_AGENT_ALIASES };
  if (fileConfig.agents) {
    for (const [alias, role] of Object.entries(fileConfig.agents)) {
      agents[alias.toLowerCase()] = normalizeRole(role);
    }
  }

  return {
    projectName: fileConfig.projectName,
    provider,
    keys: fileConfig.keys ?? {},
    models: normalizeModels(fileConfig.models),
    agentProviders: fileConfig.agentProviders ?? {},
    adapterConfig: {
      openrouter: {
        enabled: fileConfig.adapterConfig?.openrouter?.enabled ?? false,
        baseUrl:
          fileConfig.adapterConfig?.openrouter?.baseUrl ??
          "https://openrouter.ai/api/v1",
      },
      puter: {
        enabled: fileConfig.adapterConfig?.puter?.enabled ?? false,
        mode: fileConfig.adapterConfig?.puter?.mode ?? "disabled",
        endpoint: fileConfig.adapterConfig?.puter?.endpoint ?? "",
        sessionToken: fileConfig.adapterConfig?.puter?.sessionToken ?? "",
      },
    },
    agents,
    maxSteps,
    memory: {
      enabled: fileConfig.memory?.enabled ?? true,
      maxEntriesPerProject:
        fileConfig.memory?.maxEntriesPerProject ?? 200,
    },
  };
}

function resolveProvider(fileConfig: AiShellConfig): LlmProviderName {
  const openaiKey = fileConfig.keys?.openai?.trim();
  const anthropicKey = fileConfig.keys?.anthropic?.trim();
  const huggingfaceKey = fileConfig.keys?.huggingface?.trim();
  const openrouterKey = fileConfig.keys?.openrouter?.trim();
  const puterReady = isPuterReady(fileConfig);

  if (fileConfig.provider === "mock") return "mock";

  if (fileConfig.provider === "openai") {
    return openaiKey ? "openai" : "mock";
  }
  if (fileConfig.provider === "anthropic") {
    return anthropicKey ? "anthropic" : "mock";
  }
  if (fileConfig.provider === "huggingface") {
    return huggingfaceKey ? "huggingface" : "mock";
  }
  if (fileConfig.provider === "openrouter") {
    return openrouterKey ? "openrouter" : "mock";
  }
  if (fileConfig.provider === "puter") {
    return puterReady ? "puter" : "mock";
  }

  if (huggingfaceKey) return "huggingface";
  if (openrouterKey) return "openrouter";
  if (puterReady) return "puter";
  if (openaiKey) return "openai";
  if (anthropicKey) return "anthropic";

  return "mock";
}

function normalizeModels(
  models: AiShellConfig["models"],
): ProviderModelsConfig {
  const defaults: ProviderModelsConfig = {
    openai: {
      techLead: "gpt-4o-mini",
      backend: "gpt-4o-mini",
      qa: "gpt-4o-mini",
      architect: "gpt-4o-mini",
    },
    anthropic: {
      techLead: "claude-3-5-haiku-20241022",
      backend: "claude-3-5-haiku-20241022",
      qa: "claude-3-5-haiku-20241022",
      architect: "claude-3-5-haiku-20241022",
    },
    huggingface: {
      techLead: "Qwen/Qwen2.5-7B-Instruct",
      backend: "Qwen/Qwen2.5-7B-Instruct",
      qa: "HuggingFaceH4/zephyr-7b-beta",
      architect: "Qwen/Qwen2.5-7B-Instruct",
    },
    mock: {
      techLead: "mock",
      backend: "mock",
      qa: "mock",
      architect: "mock",
    },
    openrouter: {
      techLead: "openai/gpt-4o-mini",
      backend: "openai/gpt-4o-mini",
      qa: "openai/gpt-4o-mini",
      architect: "openai/gpt-4o-mini",
    },
    puter: {
      techLead: "openai/gpt-5.4-nano",
      backend: "anthropic/claude-sonnet-4-6",
      qa: "openai/gpt-5.4-nano",
      architect: "anthropic/claude-sonnet-4-6",
    },
  };

  if (!models) return defaults;

  // Backward compatibility: flat models => openai bucket.
  if (isFlatModels(models)) {
    return {
      ...defaults,
      openai: { ...defaults.openai, ...models },
    };
  }

  return {
    openai: { ...defaults.openai, ...(models.openai ?? {}) },
    anthropic: { ...defaults.anthropic, ...(models.anthropic ?? {}) },
    huggingface: { ...defaults.huggingface, ...(models.huggingface ?? {}) },
    openrouter: { ...defaults.openrouter, ...(models.openrouter ?? {}) },
    puter: { ...defaults.puter, ...(models.puter ?? {}) },
    mock: { ...defaults.mock, ...(models.mock ?? {}) },
  };
}

function isFlatModels(
  models: FlatModelsConfig | ProviderModelsConfig,
): models is FlatModelsConfig {
  const maybeFlat = models as FlatModelsConfig;
  return (
    typeof maybeFlat.techLead === "string" ||
    typeof maybeFlat.backend === "string" ||
    typeof maybeFlat.qa === "string" ||
    typeof maybeFlat.architect === "string"
  );
}

export function listConfiguredProviders(config: AiShellConfig): LlmProviderName[] {
  const providers: LlmProviderName[] = [];
  if (config.keys?.openai?.trim()) providers.push("openai");
  if (config.keys?.anthropic?.trim()) providers.push("anthropic");
  if (config.keys?.huggingface?.trim()) providers.push("huggingface");
  if (config.keys?.openrouter?.trim()) providers.push("openrouter");
  if (isPuterReady(config)) providers.push("puter");
  if (!providers.length) providers.push("mock");
  return providers;
}

export function hasProviderKey(
  config: AiShellConfig,
  provider: LlmProviderName,
): boolean {
  if (provider === "mock") return true;
  if (provider === "openai") return Boolean(config.keys?.openai?.trim());
  if (provider === "anthropic") return Boolean(config.keys?.anthropic?.trim());
  if (provider === "huggingface") return Boolean(config.keys?.huggingface?.trim());
  if (provider === "openrouter") return Boolean(config.keys?.openrouter?.trim());
  return isPuterReady(config);
}

export function resolveProviderForRole(
  config: AiShellConfig,
  role: AgentRole,
): LlmProviderName {
  const preferred = config.agentProviders?.[role] ?? config.provider ?? "mock";
  if (hasProviderKey(config, preferred)) return preferred;

  if (hasProviderKey(config, "huggingface")) return "huggingface";
  if (hasProviderKey(config, "openrouter")) return "openrouter";
  if (hasProviderKey(config, "puter")) return "puter";
  if (hasProviderKey(config, "openai")) return "openai";
  if (hasProviderKey(config, "anthropic")) return "anthropic";
  return "mock";
}

export function getModelId(
  config: AiShellConfig,
  provider: LlmProviderName,
  role: AgentRole,
): string {
  const normalized = normalizeModels(config.models);
  return normalized[provider]?.[role] ?? "mock";
}

function normalizeRole(role: string): AgentRole {
  const map: Record<string, AgentRole> = {
    techlead: "techLead",
    tech_lead: "techLead",
    backend: "backend",
    qa: "qa",
    architect: "architect",
  };
  const key = role.replace(/Agent$/i, "").toLowerCase();
  return map[key] ?? (role as AgentRole);
}

export function getAgentScopes() {
  return DEFAULT_AGENT_SCOPES;
}

export { ensureConfigFile };

function isPuterReady(config: AiShellConfig): boolean {
  const puter = config.adapterConfig?.puter;
  return Boolean(
    puter?.enabled &&
      puter.mode === "proxy" &&
      puter.endpoint?.trim() &&
      puter.sessionToken?.trim(),
  );
}
