import type { AgentRole } from "../schemas/index.js";

export interface AiShellConfig {
  projectName?: string;
  provider?: "openai" | "anthropic" | "mock";
  models?: Partial<Record<AgentRole, string>>;
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
