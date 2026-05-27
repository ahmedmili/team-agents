import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";
import type { LlmMessage, LlmProvider } from "./types.js";
import { LlmRateLimitError } from "../utils/errors.js";

const KEY_HELP =
  'Add "keys": { "openrouter": "or-..." } to .ai-shell.json or run: ai config set-key openrouter <key>';

export class OpenRouterProvider implements LlmProvider {
  readonly name = "openrouter";
  private client: OpenAI;

  constructor(apiKey?: string, baseUrl = "https://openrouter.ai/api/v1") {
    if (!apiKey?.trim()) {
      throw new Error(`OpenRouter API key not configured. ${KEY_HELP}`);
    }
    this.client = new OpenAI({
      apiKey: apiKey.trim(),
      baseURL: baseUrl,
    });
  }

  async structured<T>(
    schema: z.ZodType<T>,
    messages: LlmMessage[],
    model: string,
  ): Promise<T> {
    const normalizedModel = normalizeModel(model);
    try {
      const response = await this.client.beta.chat.completions.parse({
        model: normalizedModel,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        response_format: zodResponseFormat(schema, "response"),
      });
      const parsed = response.choices[0]?.message?.parsed;
      if (!parsed) throw new Error("No parsed response from OpenRouter");
      return parsed;
    } catch (err) {
      if (isRateLimit(err)) throw new LlmRateLimitError(String(err));
      throw err;
    }
  }

  async complete(messages: LlmMessage[], model: string): Promise<string> {
    const normalizedModel = normalizeModel(model);
    try {
      const response = await this.client.chat.completions.create({
        model: normalizedModel,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });
      return response.choices[0]?.message?.content ?? "";
    } catch (err) {
      if (isRateLimit(err)) throw new LlmRateLimitError(String(err));
      throw err;
    }
  }
}

function normalizeModel(model: string): string {
  return model.startsWith("openrouter/") ? model.replace("openrouter/", "") : model;
}

function isRateLimit(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message.includes("429") || err.message.includes("rate"))
  );
}
