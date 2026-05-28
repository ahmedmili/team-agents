import type { AgentRole } from "../schemas/index.js";
import type { McpConfig } from "../mcp/types.js";

export type { McpConfig, McpServerConfig } from "../mcp/types.js";

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
  github?: string;
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

export interface MemoryConfig {
  enabled?: boolean;
  maxEntriesPerProject?: number;
}

export interface AgentPolicyConfig {
  allowWrite?: boolean;
  allowedToolGroups?: string[];
  escalationRole?: string;
}

export interface CustomAgentConfig {
  role: string;
  outputType?: "plan" | "patch" | "review" | "message";
  systemPrompt: string;
  provider?: LlmProviderName;
  model?: string;
  stacks?: string[];
  globs?: string[];
  write?: boolean;
  policy?: AgentPolicyConfig;
}

export interface LoopConfig {
  enabled?: boolean;
  maxTurns?: number;
  maxToolCalls?: number;
  timeoutMs?: number;
}

export interface WorkflowConfig {
  enabled?: boolean;
  autoFromTechLeadPlan?: boolean;
}

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
  memory?: MemoryConfig;
  mcp?: McpConfig;
  customAgents?: Record<string, CustomAgentConfig>;
  loop?: LoopConfig;
  workflow?: WorkflowConfig;
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
