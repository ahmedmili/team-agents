import type { z } from "zod";
import type { LlmMessage, LlmProvider } from "./types.js";
import { LlmRateLimitError } from "../utils/errors.js";

const KEY_HELP =
  'Add "keys": { "huggingface": "hf_..." } to .ai-shell.json or run: ai config set-key huggingface <token>';

export class HuggingFaceProvider implements LlmProvider {
  readonly name = "huggingface";

  constructor(private apiKey?: string) {
    if (!apiKey?.trim()) {
      throw new Error(`Hugging Face token not configured. ${KEY_HELP}`);
    }
  }

  async structured<T>(
    schema: z.ZodType<T>,
    messages: LlmMessage[],
    model: string,
  ): Promise<T> {
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const prompt = [
      system,
      "Return valid JSON only.",
      messages.map((m) => `${m.role}: ${m.content}`).join("\n\n"),
    ].join("\n\n");

    const text = await this.complete(
      [{ role: "user", content: prompt }],
      model,
    );
    const json = extractJson(text);
    return schema.parse(json);
  }

  async complete(messages: LlmMessage[], model: string): Promise<string> {
    const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
    try {
      const response = await fetch(
        `https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey!.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: { max_new_tokens: 1024, return_full_text: false },
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        if (response.status === 429) {
          throw new LlmRateLimitError(
            `Hugging Face rate limit: ${response.status} ${body}`,
          );
        }
        throw new Error(`Hugging Face error: ${response.status} ${body}`);
      }

      const parsed = (await response.json()) as unknown;
      return parseTextOutput(parsed);
    } catch (err) {
      if (isRateLimit(err)) throw new LlmRateLimitError(String(err));
      throw err;
    }
  }
}

function parseTextOutput(parsed: unknown): string {
  if (typeof parsed === "string") return parsed;
  if (Array.isArray(parsed) && parsed.length) {
    const first = parsed[0] as Record<string, unknown>;
    if (typeof first.generated_text === "string") return first.generated_text;
    if (typeof first.summary_text === "string") return first.summary_text;
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    "generated_text" in parsed &&
    typeof (parsed as Record<string, unknown>).generated_text === "string"
  ) {
    return (parsed as Record<string, string>).generated_text;
  }
  return JSON.stringify(parsed);
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object in Hugging Face response");
  return JSON.parse(match[0]);
}

function isRateLimit(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message.includes("429") || err.message.toLowerCase().includes("rate"))
  );
}
