import type { AgentRole } from "../schemas/index.js";

export type LlmProviderName =
  | "openai"
  | "anthropic"
  | "huggingface"
  | "openrouter"
  | "puter"
  | "mock";

export interface ApiKeysConfig {
  openai?: string;
  anthropic?: string;
  huggingface?: string;
  openrouter?: string;
}

export interface AdapterConfig {
  openrouter?: {
    enabled?: boolean;
    baseUrl?: string;
  };
  puter?: {
    enabled?: boolean;
    mode?: "disabled" | "proxy";
    endpoint?: string;
    sessionToken?: string;
  };
}

export type FlatModelsConfig = Partial<Record<AgentRole, string>>;
export type ProviderModelsConfig = Partial<
  Record<LlmProviderName, Partial<Record<AgentRole, string>>>
>;

export interface AiShellConfig {
  projectName?: string;
  provider?: LlmProviderName;
  keys?: ApiKeysConfig;
  // Backward-compatible: accepts flat models per role or nested by provider.
  models?: FlatModelsConfig | ProviderModelsConfig;
  agentProviders?: Partial<Record<AgentRole, LlmProviderName>>;
  adapterConfig?: AdapterConfig;
  agents?: Record<string, AgentRole | string>;
  maxSteps?: number;
}

export interface AgentScope {
  role: AgentRole;
  stacks: string[];
  globs: string[];
  write: boolean;
}

export const DEFAULT_AGENT_SCOPES: Record<AgentRole, AgentScope> = {
  techLead: {
    role: "techLead",
    stacks: ["*"],
    globs: ["**/*"],
    write: false,
  },
  backend: {
    role: "backend",
    stacks: ["nestjs", "express", "node", "generic"],
    globs: ["**/*.ts", "**/*.js", "**/*.json"],
    write: true,
  },
  qa: {
    role: "qa",
    stacks: ["*"],
    globs: ["**/*"],
    write: false,
  },
  architect: {
    role: "architect",
    stacks: ["*"],
    globs: ["**/*"],
    write: false,
  },
};

export const DEFAULT_AGENT_ALIASES: Record<string, AgentRole> = {
  karim: "backend",
  sara: "architect",
  alex: "qa",
  lead: "techLead",
};
