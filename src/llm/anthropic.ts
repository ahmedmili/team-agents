import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import type { LlmMessage, LlmProvider } from "./types.js";
import { LlmRateLimitError } from "../utils/errors.js";

const KEY_HELP =
  'Add "keys": { "anthropic": "sk-ant-..." } to .ai-shell.json or run: ai config set-key anthropic <key>';

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor(apiKey?: string) {
    if (!apiKey?.trim()) {
      throw new Error(`Anthropic API key not configured. ${KEY_HELP}`);
    }
    this.client = new Anthropic({ apiKey: apiKey.trim() });
  }

  async structured<T>(
    schema: z.ZodType<T>,
    messages: LlmMessage[],
    model: string,
  ): Promise<T> {
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const userMessages = messages.filter((m) => m.role !== "system");
    const prompt = `${system}\n\nRespond with valid JSON only matching this schema description:\n${schemaDescription(schema)}\n\n${userMessages.map((m) => `${m.role}: ${m.content}`).join("\n\n")}`;

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });
      const text =
        response.content[0]?.type === "text" ? response.content[0].text : "";
      const json = extractJson(text);
      return schema.parse(json);
    } catch (err) {
      if (isRateLimit(err)) throw new LlmRateLimitError(String(err));
      throw err;
    }
  }

  async complete(messages: LlmMessage[], model: string): Promise<string> {
    const system = messages.find((m) => m.role === "system")?.content;
    const chatMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: 4096,
        system,
        messages: chatMessages,
      });
      return response.content[0]?.type === "text"
        ? response.content[0].text
        : "";
    } catch (err) {
      if (isRateLimit(err)) throw new LlmRateLimitError(String(err));
      throw err;
    }
  }
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in Anthropic response");
  return JSON.parse(match[0]);
}

function schemaDescription(schema: z.ZodType<unknown>): string {
  return JSON.stringify(schema._def, null, 0).slice(0, 500);
}

function isRateLimit(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message.includes("429") || err.message.includes("rate"))
  );
}
