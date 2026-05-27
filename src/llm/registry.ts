import type { AgentRole } from "../schemas/index.js";
import type { AiShellConfig, LlmProviderName } from "../config/types.js";
import {
  getModelId,
  resolveProviderForRole,
} from "../config/loader.js";
import type { LlmProvider } from "./types.js";
import { MockLlmProvider } from "./mock.js";
import { OpenAiProvider } from "./openai.js";
import { AnthropicProvider } from "./anthropic.js";
import { HuggingFaceProvider } from "./huggingface.js";
import { OpenRouterProvider } from "./openrouter.js";
import { PuterProvider } from "./puter.js";

export interface ProviderEventPayload {
  provider: LlmProviderName;
  role: AgentRole;
  model: string;
  status: "ok" | "error";
  latencyMs: number;
  errorMessage?: string;
}

export class LlmRegistry {
  private providers = new Map<LlmProviderName, LlmProvider>();

  constructor(
    private config: AiShellConfig,
    private onProviderEvent?: (event: ProviderEventPayload) => void,
  ) {}

  getProvider(name: LlmProviderName): LlmProvider {
    const cached = this.providers.get(name);
    if (cached) return cached;

    let created: LlmProvider;
    switch (name) {
      case "openai":
        created = new OpenAiProvider(this.config.keys?.openai);
        break;
      case "anthropic":
        created = new AnthropicProvider(this.config.keys?.anthropic);
        break;
      case "huggingface":
        created = new HuggingFaceProvider(this.config.keys?.huggingface);
        break;
      case "openrouter":
        created = new OpenRouterProvider(
          this.config.keys?.openrouter,
          this.config.adapterConfig?.openrouter?.baseUrl,
        );
        break;
      case "puter":
        created = new PuterProvider(this.config.adapterConfig?.puter);
        break;
      case "mock":
      default:
        created = new MockLlmProvider();
        break;
    }
    this.providers.set(name, created);
    return created;
  }

  getProviderForRole(role: AgentRole): LlmProvider {
    const provider = resolveProviderForRole(this.config, role);
    const base = this.getProvider(provider);
    const onEvent = this.onProviderEvent;
    if (!onEvent) return base;

    return {
      name: base.name,
      structured: async (schema, messages, model) => {
        const started = Date.now();
        try {
          const data = await base.structured(schema, messages, model);
          onEvent({
            provider,
            role,
            model,
            status: "ok",
            latencyMs: Date.now() - started,
          });
          return data;
        } catch (err) {
          onEvent({
            provider,
            role,
            model,
            status: "error",
            latencyMs: Date.now() - started,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      },
      complete: async (messages, model) => {
        const started = Date.now();
        try {
          const text = await base.complete(messages, model);
          onEvent({
            provider,
            role,
            model,
            status: "ok",
            latencyMs: Date.now() - started,
          });
          return text;
        } catch (err) {
          onEvent({
            provider,
            role,
            model,
            status: "error",
            latencyMs: Date.now() - started,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      },
    };
  }

  getProviderNameForRole(role: AgentRole): LlmProviderName {
    return resolveProviderForRole(this.config, role);
  }

  getModelForRole(role: AgentRole): string {
    const provider = this.getProviderNameForRole(role);
    return getModelId(this.config, provider, role);
  }
}
