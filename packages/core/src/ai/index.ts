/**
 * AI Module — Provider Abstraction Layer
 *
 * BYOK (Bring Your Own Key) multi-provider AI for OpenEmDash.
 */

export { DefaultAIProviderRegistry } from "./registry.js";
export { createAnthropicProvider } from "./providers/anthropic.js";
export { createOpenAIProvider } from "./providers/openai.js";
export { createOllamaProvider } from "./providers/ollama.js";
export { encryptApiKey, decryptApiKey, maskApiKey } from "./encryption.js";

export type {
	AIProvider,
	AIProviderConfig,
	AIProviderFactory,
	AIProviderRegistry,
	AIModel,
	GenerateTextParams,
	GenerateStructuredParams,
	GenerationResult,
} from "./types.js";
