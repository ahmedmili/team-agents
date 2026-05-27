import { getAgentScopes } from "../config/loader.js";
import {
  ReviewOutputSchema,
  type AgentOutput,
} from "../schemas/index.js";
import { BaseAgent, buildMessages, type AgentInput } from "./base.js";
import type { AgentRole } from "../schemas/index.js";

const SYSTEM = `You are the Architect agent. Review system design, scalability, and module boundaries.
You are read-only: never propose file patches.`;

export class ArchitectAgent extends BaseAgent {
  readonly role: AgentRole = "architect";
  readonly scope = getAgentScopes().architect;

  async run(input: AgentInput): Promise<AgentOutput> {
    const messages = buildMessages(
      SYSTEM,
      "[OUTPUT_TYPE:review]",
      input,
    );
    const data = await this.llm.structured(
      ReviewOutputSchema,
      messages,
      this.model(),
    );
    return { agentId: "architect", type: "review", data };
  }
}
