/**
 * AI Provider Registry
 *
 * Manages registered AI providers and their configured instances.
 */

import type {
	AIProvider,
	AIProviderConfig,
	AIProviderFactory,
	AIProviderRegistry,
} from "./types.js";

export class DefaultAIProviderRegistry implements AIProviderRegistry {
	private factories = new Map<string, AIProviderFactory>();
	private instances = new Map<string, AIProvider>();

	register(providerId: string, factory: AIProviderFactory): void {
		this.factories.set(providerId, factory);
	}

	get(providerId: string): AIProvider | undefined {
		return this.instances.get(providerId);
	}

	list(): string[] {
		return [...this.factories.keys()];
	}

	configure(config: AIProviderConfig): AIProvider {
		const factory = this.factories.get(config.providerId);
		if (!factory) {
			throw new Error(
				`Unknown AI provider: ${config.providerId}. Available: ${this.list().join(", ")}`,
			);
		}
		const instance = factory(config);
		this.instances.set(config.providerId, instance);
		return instance;
	}
}
