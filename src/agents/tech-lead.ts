import { getAgentScopes } from "../config/loader.js";
import {
  PlanOutputSchema,
  type AgentOutput,
} from "../schemas/index.js";
import { BaseAgent, buildMessages, type AgentInput } from "./base.js";
import type { AgentRole } from "../schemas/index.js";
const SYSTEM = `You are the Tech Lead agent. Break user requests into actionable tasks for backend, qa, and architect agents.
Output a concise plan with tasks. Do not write code or patches.`;

export class TechLeadAgent extends BaseAgent {
  readonly role: AgentRole = "techLead";
  readonly scope = getAgentScopes().techLead;

  async run(input: AgentInput): Promise<AgentOutput> {
    const messages = buildMessages(
      SYSTEM,
      "[OUTPUT_TYPE:plan]",
      input,
    );
    const data = await this.provider().structured(
      PlanOutputSchema,
      messages,
      this.model(),
    );
    return { agentId: "techLead", type: "plan", data };
  }
}
