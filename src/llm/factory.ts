import type { AiShellConfig } from "../config/types.js";
import { AnthropicProvider } from "./anthropic.js";
import { HuggingFaceProvider } from "./huggingface.js";
import { MockLlmProvider } from "./mock.js";
import { OpenAiProvider } from "./openai.js";
import { OpenRouterProvider } from "./openrouter.js";
import { PuterProvider } from "./puter.js";
import type { LlmProvider } from "./types.js";

export function createLlmProvider(config: AiShellConfig): LlmProvider {
  const provider = config.provider ?? "mock";
  switch (provider) {
    case "openai":
      return new OpenAiProvider(config.keys?.openai);
    case "anthropic":
      return new AnthropicProvider(config.keys?.anthropic);
    case "huggingface":
      return new HuggingFaceProvider(config.keys?.huggingface);
    case "openrouter":
      return new OpenRouterProvider(
        config.keys?.openrouter,
        config.adapterConfig?.openrouter?.baseUrl,
      );
    case "puter":
      return new PuterProvider(config.adapterConfig?.puter);
    case "mock":
    default:
      return new MockLlmProvider();
  }
}
