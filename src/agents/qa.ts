import { getAgentScopes } from "../config/loader.js";
import {
  ReviewOutputSchema,
  type AgentOutput,
} from "../schemas/index.js";
import { BaseAgent, buildMessages, type AgentInput } from "./base.js";
import type { AgentRole } from "../schemas/index.js";

const SYSTEM = `You are the QA agent. Review plans and implementations for testing gaps, edge cases, and validation.
You are read-only: never propose file patches.`;

export class QaAgent extends BaseAgent {
  readonly role: AgentRole = "qa";
  readonly scope = getAgentScopes().qa;

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
    return { agentId: "qa", type: "review", data };
  }
}
