import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";
import type { LlmMessage, LlmProvider } from "./types.js";
import { LlmRateLimitError } from "../utils/errors.js";

export class OpenAiProvider implements LlmProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is required");
    this.client = new OpenAI({ apiKey: key });
  }

  async structured<T>(
    schema: z.ZodType<T>,
    messages: LlmMessage[],
    model: string,
  ): Promise<T> {
    try {
      const response = await this.client.beta.chat.completions.parse({
        model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        response_format: zodResponseFormat(schema, "response"),
      });
      const parsed = response.choices[0]?.message?.parsed;
      if (!parsed) throw new Error("No parsed response from OpenAI");
      return parsed;
    } catch (err) {
      if (isRateLimit(err)) throw new LlmRateLimitError(String(err));
      throw err;
    }
  }

  async complete(messages: LlmMessage[], model: string): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model,
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

function isRateLimit(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message.includes("429") || err.message.includes("rate"))
  );
}
