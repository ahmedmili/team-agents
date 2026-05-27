import type { z } from "zod";
import type { LlmMessage, LlmProvider } from "./types.js";
import { LlmRateLimitError } from "../utils/errors.js";

export interface PuterProxyConfig {
  enabled?: boolean;
  mode?: "disabled" | "proxy";
  endpoint?: string;
  sessionToken?: string;
}

const CONFIG_HELP =
  'Configure adapterConfig.puter with { enabled: true, mode: "proxy", endpoint, sessionToken }.';

export class PuterProvider implements LlmProvider {
  readonly name = "puter";

  constructor(private config: PuterProxyConfig | undefined) {
    if (!this.config?.enabled || this.config.mode !== "proxy") {
      throw new Error(`Puter adapter is disabled. ${CONFIG_HELP}`);
    }
    if (!this.config.endpoint?.trim() || !this.config.sessionToken?.trim()) {
      throw new Error(`Puter adapter missing endpoint/sessionToken. ${CONFIG_HELP}`);
    }
  }

  async structured<T>(
    schema: z.ZodType<T>,
    messages: LlmMessage[],
    model: string,
  ): Promise<T> {
    const text = await this.complete(messages, model);
    const json = extractJson(text);
    return schema.parse(json);
  }

  async complete(messages: LlmMessage[], model: string): Promise<string> {
    try {
      const response = await fetch(this.config!.endpoint!, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config!.sessionToken!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "puter",
          model: normalizeModel(model),
          messages,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        if (response.status === 429) {
          throw new LlmRateLimitError(`Puter rate limit: ${response.status} ${text}`);
        }
        throw new Error(`Puter proxy error: ${response.status} ${text}`);
      }
      const payload = (await response.json()) as { text?: string; content?: string };
      return payload.text ?? payload.content ?? "";
    } catch (err) {
      if (isRateLimit(err)) throw new LlmRateLimitError(String(err));
      throw err;
    }
  }
}

function normalizeModel(model: string): string {
  return model.startsWith("puter/") ? model.replace("puter/", "") : model;
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object in Puter response");
  return JSON.parse(match[0]);
}

function isRateLimit(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message.includes("429") || err.message.toLowerCase().includes("rate"))
  );
}
