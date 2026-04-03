/**
 * AI Provider Abstraction Layer
 *
 * BYOK (Bring Your Own Key) multi-provider AI interface.
 * Providers are registered at runtime via plugins or admin settings.
 */

/**
 * A model available from an AI provider.
 */
export interface AIModel {
	/** Model identifier, e.g. "claude-sonnet-4-5" */
	id: string;
	/** Human-readable name */
	name: string;
	/** Context window size in tokens */
	contextWindow: number;
	/** Whether the model supports streaming text generation */
	supportsStreaming: boolean;
}

/**
 * Parameters for text generation.
 */
export interface GenerateTextParams {
	model: string;
	systemPrompt: string;
	userPrompt: string;
	maxTokens?: number;
	temperature?: number;
}

/**
 * Parameters for structured output generation.
 */
export interface GenerateStructuredParams<T = unknown> {
	model: string;
	systemPrompt: string;
	userPrompt: string;
	/** JSON schema describing the expected output shape */
	schema: Record<string, unknown>;
	/** Optional: parse and validate the response */
	parse?: (raw: unknown) => T;
}

/**
 * Result of a generation call, including token usage for cost tracking.
 */
export interface GenerationResult {
	text: string;
	tokensUsed: {
		input: number;
		output: number;
		total: number;
	};
	model: string;
}

/**
 * AI provider interface. Implementations wrap vendor-specific SDKs.
 *
 * Providers are stateless — API keys are passed at construction time
 * and stored encrypted in _emdash_settings.
 */
export interface AIProvider {
	/** Provider identifier, e.g. "anthropic", "openai", "ollama" */
	readonly id: string;
	/** Human-readable name, e.g. "Anthropic Claude" */
	readonly name: string;
	/** Available models for this provider */
	readonly models: AIModel[];

	/**
	 * Generate text with streaming support.
	 * Yields text chunks as they arrive from the provider.
	 */
	generateText(params: GenerateTextParams): AsyncIterable<string>;

	/**
	 * Generate text and return the complete result with token usage.
	 * Use this when you need the full response and cost tracking.
	 */
	generateTextComplete(params: GenerateTextParams): Promise<GenerationResult>;

	/**
	 * Generate structured output matching a JSON schema.
	 * Falls back to text generation + JSON parsing for providers
	 * that don't support native structured output.
	 */
	generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T>;

	/**
	 * Test that the provider is reachable with the configured API key.
	 * Returns true if the key is valid and the provider responds.
	 */
	testConnection(): Promise<boolean>;
}

/**
 * Factory function for creating an AI provider instance.
 * Called with the decrypted API key (or base URL for local providers).
 */
export type AIProviderFactory = (config: AIProviderConfig) => AIProvider;

/**
 * Configuration for an AI provider instance.
 */
export interface AIProviderConfig {
	/** Provider identifier */
	providerId: string;
	/** API key (decrypted) or base URL for local providers */
	apiKey?: string;
	/** Base URL override (for Ollama, custom endpoints) */
	baseUrl?: string;
	/** Default model to use if not specified per-request */
	defaultModel?: string;
}

/**
 * Registry of available AI providers.
 * The runtime maintains one registry, providers register themselves.
 */
export interface AIProviderRegistry {
	/** Register a provider factory */
	register(providerId: string, factory: AIProviderFactory): void;
	/** Get a configured provider instance */
	get(providerId: string): AIProvider | undefined;
	/** List all registered provider IDs */
	list(): string[];
	/** Configure a provider with credentials and create an instance */
	configure(config: AIProviderConfig): AIProvider;
}
