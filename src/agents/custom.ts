import { z } from "zod";
import type { CustomAgentConfig } from "../config/types.js";
import type {
  AgentOutput,
  AgentRole,
  PatchOutput,
  PlanOutput,
  ReviewOutput,
} from "../schemas/index.js";
import {
  PatchOutputSchema,
  PlanOutputSchema,
  ReviewOutputSchema,
} from "../schemas/index.js";
import { buildMessages, type Agent, type AgentInput } from "./base.js";
import type { AgentScope } from "../config/types.js";
import type { LlmProvider, LlmMessage } from "../llm/types.js";

const MessageOutputSchema = z.object({
  summary: z.string(),
});

export class CustomAgent implements Agent {
  readonly role: AgentRole;
  readonly scope: AgentScope;

  constructor(
    private alias: string,
    role: string,
    private config: CustomAgentConfig,
    private providerResolver: (provider?: string) => LlmProvider,
    private modelResolver: (provider: LlmProvider, role: string, model?: string) => string,
  ) {
    this.role = role;
    this.scope = {
      role,
      stacks: config.stacks ?? ["*"],
      globs: config.globs ?? ["**/*"],
      write: config.write ?? false,
    };
  }

  async run(input: AgentInput): Promise<AgentOutput> {
    const provider = this.providerResolver(this.config.provider);
    const model = this.modelResolver(provider, this.role, this.config.model);
    const outputType = this.config.outputType ?? "message";
    const messages: LlmMessage[] = buildMessages(
      this.config.systemPrompt,
      `[OUTPUT_TYPE:${outputType}]`,
      input,
    );

    if (outputType === "plan") {
      const data = await provider.structured(PlanOutputSchema, messages, model);
      return { agentId: this.role, type: "plan", data: data as PlanOutput };
    }
    if (outputType === "patch") {
      const data = await provider.structured(PatchOutputSchema, messages, model);
      return { agentId: this.role, type: "patch", data: data as PatchOutput };
    }
    if (outputType === "review") {
      const data = await provider.structured(ReviewOutputSchema, messages, model);
      return { agentId: this.role, type: "review", data: data as ReviewOutput };
    }

    const data = await provider.structured(MessageOutputSchema, messages, model);
    return { agentId: this.role, type: "message", data };
  }

  label(): string {
    return this.alias;
  }
}

