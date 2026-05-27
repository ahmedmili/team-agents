import type { AiShellConfig } from "../config/types.js";
import { AnthropicProvider } from "./anthropic.js";
import { MockLlmProvider } from "./mock.js";
import { OpenAiProvider } from "./openai.js";
import type { LlmProvider } from "./types.js";

export function createLlmProvider(config: AiShellConfig): LlmProvider {
  const provider = config.provider ?? "mock";
  switch (provider) {
    case "openai":
      return new OpenAiProvider();
    case "anthropic":
      return new AnthropicProvider();
    case "mock":
    default:
      return new MockLlmProvider();
  }
}
