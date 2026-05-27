import { InferenceClient } from "@huggingface/inference";
import type { z } from "zod";
import type { LlmMessage, LlmProvider } from "./types.js";
import { LlmRateLimitError } from "../utils/errors.js";

const KEY_HELP =
  'Add "keys": { "huggingface": "hf_..." } to .ai-shell.json or run: ai config set-key huggingface <token>';

export class HuggingFaceProvider implements LlmProvider {
  readonly name = "huggingface";
  private readonly client: InferenceClient;

  constructor(apiKey?: string) {
    if (!apiKey?.trim()) {
      throw new Error(`Hugging Face token not configured. ${KEY_HELP}`);
    }
    this.client = new InferenceClient(apiKey.trim());
  }

  async structured<T>(
    schema: z.ZodType<T>,
    messages: LlmMessage[],
    model: string,
  ): Promise<T> {
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const chatMessages: LlmMessage[] = [
      {
        role: "system",
        content: [
          system,
          "You MUST output a single, valid JSON object.",
          "Rules: no markdown fences, no extra text, no trailing commas.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
      ...messages.filter((m) => m.role !== "system"),
    ];
    const text = await this.complete(chatMessages, model);
    let json: unknown;
    try {
      json = extractJson(text);
    } catch {
      // If the model doesn't return JSON at all, fall back to schema defaults.
      return schema.parse(buildFallbackFromSchema(schema, { message: text }));
    }

    try {
      return schema.parse(json);
    } catch (err) {
      // Some HF models do not follow our JSON instructions and return
      // error-shaped objects (e.g. { review: false, message: "..." }).
      // Prefer a deterministic fallback over crashing the whole CLI.
      const maybeZod = err as { name?: string };
      if (maybeZod?.name === "ZodError") {
        const fallback = buildFallbackFromSchema(schema, json);
        return schema.parse(fallback);
      }
      throw err;
    }
  }

  async complete(messages: LlmMessage[], model: string): Promise<string> {
    try {
      const response = await this.client.chatCompletion({
        model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: 1024,
      });
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response from Hugging Face");
      }
      return content;
    } catch (err) {
      if (isRateLimit(err)) throw new LlmRateLimitError(String(err));
      throw formatHfError(err);
    }
  }
}

function formatHfError(err: unknown): Error {
  if (!(err instanceof Error)) return new Error(String(err));

  const causeMsg =
    err.cause instanceof Error
      ? err.cause.message
      : err.cause != null
        ? String(err.cause)
        : undefined;

  if (err.message === "fetch failed" && causeMsg) {
    return new Error(
      `Hugging Face network error: ${causeMsg}. Check your connection, firewall, or HF token.`,
      { cause: err },
    );
  }

  if (causeMsg && !err.message.includes(causeMsg)) {
    return new Error(`Hugging Face: ${err.message} (${causeMsg})`, { cause: err });
  }

  return err;
}

function extractJson(text: string): unknown {
  const stripped = stripCodeFences(text);
  const extracted = extractFirstBalancedJsonObject(stripped);
  const parsed = tryJsonParse(extracted);
  if (parsed.ok) return parsed.value;

  // Small repair pass for "JSON-like" outputs (unquoted keys, trailing commas).
  const repaired = repairJsonLike(extracted);
  const reparsed = tryJsonParse(repaired);
  if (reparsed.ok) return reparsed.value;

  throw new Error(
    `Failed to parse Hugging Face structured JSON. ` +
      `Original error: ${parsed.error.message}. ` +
      `Response starts with: ${text.slice(0, 120).replace(/\s+/g, " ")}`,
  );
}

function stripCodeFences(text: string): string {
  // Remove ```json ... ``` and ``` ... ``` wrappers.
  return text
    .replace(/```[a-zA-Z0-9_-]*\s*/g, "")
    .replace(/```/g, "")
    .trim();
}

function extractFirstBalancedJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error("No JSON object '{...}' found in Hugging Face response");
  }

  let depth = 0;
  let inString = false;
  let stringChar: '"' | "'" | null = null;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
        stringChar = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") depth--;

    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }

  throw new Error("Unbalanced JSON braces in Hugging Face response");
}

function tryJsonParse(text: string): {
  ok: true;
  value: unknown;
} | {
  ok: false;
  error: Error;
} {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

function repairJsonLike(text: string): string {
  let out = text.trim();

  // Remove trailing commas before } or ]
  out = out.replace(/,\s*([}\]])/g, "$1");

  // Quote unquoted object keys: { foo: 1 } -> { "foo": 1 }
  // Intentionally conservative (alphanumeric + underscore keys).
  out = out.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');

  // Replace Python/JS-style literals
  out = out.replace(/\btrue\b/g, "true");
  out = out.replace(/\bfalse\b/g, "false");
  out = out.replace(/\bnull\b/g, "null");

  return out;
}

function buildFallbackFromSchema(schema: z.ZodType<unknown>, input: unknown): unknown {
  // Best-effort runtime introspection of Zod object schemas.
  const anySchema = schema as unknown as {
    _def?: {
      typeName?: string;
      shape?: () => Record<string, unknown>;
      innerType?: unknown;
      defaultValue?: () => unknown;
      values?: unknown[];
    };
  };

  if (anySchema?._def?.typeName !== "ZodObject") {
    // If we can't introspect, return a sensible empty JSON object.
    return {};
  }

  const shape = anySchema._def.shape?.();
  if (!shape) return {};

  const obj = typeof input === "object" && input ? (input as Record<string, unknown>) : {};

  const result: Record<string, unknown> = {};
  for (const [key, zType] of Object.entries(shape)) {
    const t = zType as any;
    const typeName: string | undefined = t?._def?.typeName;

    if (key === "summary" && typeof obj.message === "string") {
      result[key] = obj.message;
      continue;
    }
    if (key === "approved" && typeof obj.review === "boolean") {
      result[key] = obj.review;
      continue;
    }
    if ((key === "findings" || key === "tasks" || key === "questions" || key === "patches") && Array.isArray(obj[key])) {
      result[key] = obj[key];
      continue;
    }

    if (typeName === "ZodString") {
      result[key] = "";
    } else if (typeName === "ZodBoolean") {
      result[key] = false;
    } else if (typeName === "ZodArray") {
      result[key] = [];
    } else if (typeName === "ZodDefault" && typeof t?._def?.defaultValue === "function") {
      result[key] = t._def.defaultValue();
    } else if (typeName === "ZodEnum" && Array.isArray(t?._def?.values) && t._def.values.length) {
      result[key] = t._def.values[0];
    } else if (typeName === "ZodObject") {
      result[key] = buildFallbackFromSchema(t, obj[key]);
    } else if (typeName === "ZodOptional") {
      // Optional keys can be omitted; set to undefined.
      result[key] = undefined;
    } else {
      result[key] = undefined;
    }
  }

  return result;
}

function isRateLimit(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message.includes("429") || err.message.toLowerCase().includes("rate"))
  );
}
