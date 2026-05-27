import type { AgentRole } from "../schemas/index.js";
import type { Agent } from "./base.js";
import { TechLeadAgent } from "./tech-lead.js";
import { BackendAgent } from "./backend.js";
import { QaAgent } from "./qa.js";
import { ArchitectAgent } from "./architect.js";
import type { LlmProvider } from "../llm/types.js";
import type { AiShellConfig } from "../config/types.js";

export class AgentRegistry {
  private agents: Map<AgentRole, Agent>;

  constructor(
    llm: LlmProvider,
    private config: AiShellConfig,
  ) {
    const getModel = (role: AgentRole) =>
      config.models?.[role] ?? "gpt-4o-mini";

    this.agents = new Map([
      ["techLead", new TechLeadAgent(llm, getModel)],
      ["backend", new BackendAgent(llm, getModel)],
      ["qa", new QaAgent(llm, getModel)],
      ["architect", new ArchitectAgent(llm, getModel)],
    ]);
  }

  get(role: AgentRole): Agent {
    const agent = this.agents.get(role);
    if (!agent) throw new Error(`Unknown agent: ${role}`);
    return agent;
  }

  resolveAlias(alias: string): AgentRole | null {
    const key = alias.toLowerCase().replace(/^@/, "");
    const role = this.config.agents?.[key] as AgentRole | undefined;
    return role ?? null;
  }

  listAliases(): Array<{ alias: string; role: AgentRole }> {
    const entries = this.config.agents ?? {};
    return Object.entries(entries).map(([alias, role]) => ({
      alias,
      role: role as AgentRole,
    }));
  }

  all(): Agent[] {
    return [...this.agents.values()];
  }
}
