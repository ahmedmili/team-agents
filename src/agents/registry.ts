import type { AgentRole } from "../schemas/index.js";
import type { Agent } from "./base.js";
import { TechLeadAgent } from "./tech-lead.js";
import { BackendAgent } from "./backend.js";
import { QaAgent } from "./qa.js";
import { ArchitectAgent } from "./architect.js";
import type { AiShellConfig, LlmProviderName } from "../config/types.js";
import { LlmRegistry } from "../llm/registry.js";
import { CustomAgent } from "./custom.js";

export class AgentRegistry {
  private agents: Map<AgentRole, Agent>;
  private aliasKinds = new Map<string, "builtin" | "custom">();

  constructor(
    private llmRegistry: LlmRegistry,
    private config: AiShellConfig,
  ) {
    const getProviderForRole = (role: AgentRole) =>
      llmRegistry.getProviderForRole(role);
    const getModelForRole = (role: AgentRole) =>
      llmRegistry.getModelForRole(role);

    this.agents = new Map([
      ["techLead", new TechLeadAgent(getProviderForRole, getModelForRole)],
      ["backend", new BackendAgent(getProviderForRole, getModelForRole)],
      ["qa", new QaAgent(getProviderForRole, getModelForRole)],
      ["architect", new ArchitectAgent(getProviderForRole, getModelForRole)],
    ]);

    for (const [alias, role] of Object.entries(this.config.agents ?? {})) {
      const normalizedAlias = alias.toLowerCase();
      const normalizedRole = role as AgentRole;
      if (this.agents.has(normalizedRole)) {
        this.aliasKinds.set(normalizedAlias, "builtin");
      }
    }

    for (const [alias, cfg] of Object.entries(this.config.customAgents ?? {})) {
      const role = cfg.role as AgentRole;
      const custom = new CustomAgent(
        alias,
        role,
        cfg,
        (provider?: string) => {
          if (provider) {
            return this.llmRegistry.getProvider(provider as LlmProviderName);
          }
          return this.llmRegistry.getProviderForRole(role);
        },
        (provider, agentRole, modelOverride) => {
          if (modelOverride) return modelOverride;
          const configured = this.llmRegistry.getModelForRole(agentRole as AgentRole);
          if (configured && configured !== "mock") return configured;
          if (provider.name === "openai") return "gpt-4o-mini";
          if (provider.name === "anthropic") return "claude-3-5-haiku-20241022";
          return "mock";
        },
      );
      this.agents.set(role, custom);
      this.aliasKinds.set(alias.toLowerCase(), "custom");
    }
  }

  get(role: AgentRole): Agent {
    const agent = this.agents.get(role);
    if (!agent) throw new Error(`Unknown agent: ${role}`);
    return agent;
  }

  resolveAlias(alias: string): AgentRole | null {
    const key = alias.toLowerCase().replace(/^@/, "");
    const mapped = this.config.agents?.[key] as AgentRole | undefined;
    if (mapped && this.agents.has(mapped)) return mapped;
    const custom = this.config.customAgents?.[key];
    const role = custom?.role as AgentRole | undefined;
    if (role && this.agents.has(role)) return role;
    return null;
  }

  listAliases(): Array<{ alias: string; role: AgentRole; kind: "builtin" | "custom" }> {
    const rows: Array<{ alias: string; role: AgentRole; kind: "builtin" | "custom" }> = [];
    for (const [alias, role] of Object.entries(this.config.agents ?? {})) {
      rows.push({
        alias,
        role: role as AgentRole,
        kind: this.aliasKinds.get(alias.toLowerCase()) ?? "builtin",
      });
    }
    for (const [alias, cfg] of Object.entries(this.config.customAgents ?? {})) {
      rows.push({
        alias,
        role: cfg.role as AgentRole,
        kind: "custom",
      });
    }
    return rows;
  }

  all(): Agent[] {
    return [...this.agents.values()];
  }
}
