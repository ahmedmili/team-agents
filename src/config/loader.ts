import fs from "fs-extra";
import path from "node:path";
import type { AiShellConfig } from "./types.js";
import {
  DEFAULT_AGENT_ALIASES,
  DEFAULT_AGENT_SCOPES,
} from "./types.js";
import type { AgentRole } from "../schemas/index.js";

const CONFIG_FILENAME = ".ai-shell.json";

export function loadConfig(projectRoot: string): AiShellConfig {
  const configPath = path.join(projectRoot, CONFIG_FILENAME);
  let fileConfig: AiShellConfig = {};
  if (fs.existsSync(configPath)) {
    fileConfig = fs.readJsonSync(configPath) as AiShellConfig;
  }
  const maxSteps =
    fileConfig.maxSteps ??
    (process.env.AI_SHELL_MAX_STEPS
      ? parseInt(process.env.AI_SHELL_MAX_STEPS, 10)
      : 5);

  let provider = fileConfig.provider;
  if (!provider) {
    if (process.env.AI_SHELL_PROVIDER === "mock") provider = "mock";
    else if (process.env.ANTHROPIC_API_KEY) provider = "anthropic";
    else if (process.env.OPENAI_API_KEY) provider = "openai";
    else provider = "mock";
  }

  const agents: Record<string, AgentRole> = { ...DEFAULT_AGENT_ALIASES };
  if (fileConfig.agents) {
    for (const [alias, role] of Object.entries(fileConfig.agents)) {
      agents[alias.toLowerCase()] = normalizeRole(role);
    }
  }

  return {
    projectName: fileConfig.projectName,
    provider,
    models: {
      techLead:
        fileConfig.models?.techLead ??
        process.env.AI_SHELL_MODEL_TECH_LEAD ??
        process.env.AI_SHELL_MODEL ??
        "gpt-4o-mini",
      backend:
        fileConfig.models?.backend ??
        process.env.AI_SHELL_MODEL_BACKEND ??
        process.env.AI_SHELL_MODEL ??
        "gpt-4o-mini",
      qa:
        fileConfig.models?.qa ??
        process.env.AI_SHELL_MODEL ??
        "gpt-4o-mini",
      architect:
        fileConfig.models?.architect ??
        process.env.AI_SHELL_MODEL ??
        "gpt-4o-mini",
    },
    agents,
    maxSteps,
  };
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

export { CONFIG_FILENAME };
