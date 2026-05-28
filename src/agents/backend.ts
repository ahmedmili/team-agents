import { getAgentScopes } from "../config/loader.js";
import {
  PatchOutputSchema,
  type AgentOutput,
} from "../schemas/index.js";
import { BaseAgent, buildMessages, type AgentInput } from "./base.js";
import type { AgentRole } from "../schemas/index.js";
import { formatContextPack } from "../repo/scanner.js";

const SYSTEM = `You are the Backend developer agent. Propose code changes as unified diffs only.
Each patch must use valid unified diff format for the target file path relative to project root.
Only patch source files: **/*.ts, **/*.js, **/*.json (not README.md or other docs).
For analysis or documentation requests, return an empty patches array and explain in summary.`;

export class BackendAgent extends BaseAgent {
  readonly role: AgentRole = "backend";
  readonly scope = getAgentScopes().backend;

  async run(input: AgentInput): Promise<AgentOutput> {
    const enriched: AgentInput = {
      ...input,
      message: `${input.message}\n\n${formatContextPack(input.profile)}`,
    };
    const messages = buildMessages(
      SYSTEM,
      "[OUTPUT_TYPE:patch]",
      enriched,
    );
    const data = await this.provider().structured(
      PatchOutputSchema,
      messages,
      this.model(),
    );
    return { agentId: "backend", type: "patch", data };
  }
}
