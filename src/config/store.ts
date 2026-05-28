import fs from "fs-extra";
import path from "node:path";
import type { AiShellConfig, LlmProviderName } from "./types.js";
import type { AgentRole } from "../schemas/index.js";

export const CONFIG_FILENAME = ".ai-shell.json";

export function getConfigPath(projectRoot: string): string {
  return path.join(projectRoot, CONFIG_FILENAME);
}

export function readConfigFile(projectRoot: string): AiShellConfig {
  const configPath = getConfigPath(projectRoot);
  if (!fs.existsSync(configPath)) {
    return {};
  }
  return fs.readJsonSync(configPath) as AiShellConfig;
}

export function writeConfigFile(
  projectRoot: string,
  config: AiShellConfig,
): void {
  const configPath = getConfigPath(projectRoot);
  fs.ensureDirSync(projectRoot);
  fs.writeJsonSync(configPath, config, { spaces: 2 });
}

export function ensureConfigFile(projectRoot: string): AiShellConfig {
  const configPath = getConfigPath(projectRoot);
  if (!fs.existsSync(configPath)) {
    const initial: AiShellConfig = {
      projectName: path.basename(projectRoot),
      provider: "mock",
      keys: {
        openai: "",
        anthropic: "",
        huggingface: "",
        openrouter: "",
      },
      models: {
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
      },
      agentProviders: {},
      adapterConfig: {
        openrouter: {
          enabled: false,
          baseUrl: "https://openrouter.ai/api/v1",
        },
        puter: {
          enabled: false,
          mode: "disabled",
          endpoint: "",
          sessionToken: "",
        },
      },
      agents: {
        karim: "backend",
        sara: "architect",
        alex: "qa",
        lead: "techLead",
      },
      maxSteps: 5,
      memory: {
        enabled: true,
        maxEntriesPerProject: 200,
      },
    };
    writeConfigFile(projectRoot, initial);
    return initial;
  }
  return readConfigFile(projectRoot);
}

export function setApiKey(
  projectRoot: string,
  provider: LlmProviderName,
  apiKey: string,
): AiShellConfig {
  if (provider === "mock" || provider === "puter") {
    throw new Error(
      `Cannot set an API key for provider "${provider}". Use adapterConfig for puter.`,
    );
  }
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error("API key cannot be empty.");
  }

  const config = ensureConfigFile(projectRoot);
  const keys = { ...config.keys, [provider]: trimmed };
  const updated: AiShellConfig = {
    ...config,
    keys,
    provider,
  };
  writeConfigFile(projectRoot, updated);
  return updated;
}

export function setProvider(
  projectRoot: string,
  provider: LlmProviderName,
): AiShellConfig {
  const config = ensureConfigFile(projectRoot);
  if (provider !== "mock") {
    const key = config.keys?.[provider as keyof typeof config.keys];
    const puter = config.adapterConfig?.puter;
    const hasPuterConfig = Boolean(
      puter?.enabled &&
        puter.mode === "proxy" &&
        puter.endpoint?.trim() &&
        puter.sessionToken?.trim(),
    );
    const valid = provider === "puter" ? hasPuterConfig : Boolean(key);
    if (!valid) {
      const hint =
        provider === "puter"
          ? "Configure adapterConfig.puter { enabled: true, mode: 'proxy', endpoint, sessionToken }"
          : `Add keys.${provider} or run: ai config set-key ${provider} <key>`;
      throw new Error(
        `Provider ${provider} is not configured in .ai-shell.json. ${hint}`,
      );
    }
  }
  const updated: AiShellConfig = { ...config, provider };
  writeConfigFile(projectRoot, updated);
  return updated;
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export interface KeysStatusLine {
  label: string;
  value: string;
  set: boolean;
}

export function getKeysStatus(config: AiShellConfig): KeysStatusLine[] {
  return [
    {
      label: "openai",
      value: config.keys?.openai ? maskApiKey(config.keys.openai) : "(not set)",
      set: Boolean(config.keys?.openai),
    },
    {
      label: "anthropic",
      value: config.keys?.anthropic
        ? maskApiKey(config.keys.anthropic)
        : "(not set)",
      set: Boolean(config.keys?.anthropic),
    },
    {
      label: "huggingface",
      value: config.keys?.huggingface
        ? maskApiKey(config.keys.huggingface)
        : "(not set)",
      set: Boolean(config.keys?.huggingface),
    },
    {
      label: "openrouter",
      value: config.keys?.openrouter
        ? maskApiKey(config.keys.openrouter)
        : "(not set)",
      set: Boolean(config.keys?.openrouter),
    },
    {
      label: "puter (proxy)",
      value: config.adapterConfig?.puter?.sessionToken
        ? maskApiKey(config.adapterConfig.puter.sessionToken)
        : "(not set)",
      set: Boolean(
        config.adapterConfig?.puter?.enabled &&
          config.adapterConfig?.puter?.mode === "proxy" &&
          config.adapterConfig?.puter?.sessionToken,
      ),
    },
  ];
}

export function parseProviderArg(arg: string): LlmProviderName {
  const p = arg.toLowerCase();
  if (
    p === "openai" ||
    p === "anthropic" ||
    p === "huggingface" ||
    p === "openrouter" ||
    p === "puter" ||
    p === "mock"
  ) {
    return p;
  }
  throw new Error(
    `Unknown provider "${arg}". Use: openai, anthropic, huggingface, openrouter, puter, or mock`,
  );
}

export function setAgentProvider(
  projectRoot: string,
  role: AgentRole,
  provider: LlmProviderName | "clear",
): AiShellConfig {
  const config = ensureConfigFile(projectRoot);
  const current = { ...(config.agentProviders ?? {}) };
  if (provider === "clear") {
    delete current[role];
  } else {
    current[role] = provider;
  }
  const updated: AiShellConfig = {
    ...config,
    agentProviders: current,
  };
  writeConfigFile(projectRoot, updated);
  return updated;
}

export function setAdapterConfig(
  projectRoot: string,
  patch: Partial<NonNullable<AiShellConfig["adapterConfig"]>>,
): AiShellConfig {
  const config = ensureConfigFile(projectRoot);
  const updated: AiShellConfig = {
    ...config,
    adapterConfig: {
      ...(config.adapterConfig ?? {}),
      ...patch,
      openrouter: {
        ...(config.adapterConfig?.openrouter ?? {}),
        ...(patch.openrouter ?? {}),
      },
      puter: {
        ...(config.adapterConfig?.puter ?? {}),
        ...(patch.puter ?? {}),
      },
    },
  };
  writeConfigFile(projectRoot, updated);
  return updated;
}
