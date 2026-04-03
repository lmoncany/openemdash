/**
 * Anthropic Claude AI Provider
 *
 * Implements the AIProvider interface for Anthropic's Claude models.
 * Requires the user to install @anthropic-ai/sdk as a peer dependency.
 */

import type {
	AIModel,
	AIProvider,
	AIProviderConfig,
	GenerateTextParams,
	GenerateStructuredParams,
	GenerationResult,
} from "../types.js";

const ANTHROPIC_MODELS: AIModel[] = [
	{
		id: "claude-sonnet-4-5",
		name: "Claude Sonnet 4.5",
		contextWindow: 200_000,
		supportsStreaming: true,
	},
	{
		id: "claude-haiku-4-5",
		name: "Claude Haiku 4.5",
		contextWindow: 200_000,
		supportsStreaming: true,
	},
	{ id: "claude-opus-4", name: "Claude Opus 4", contextWindow: 200_000, supportsStreaming: true },
];

export class AnthropicProvider implements AIProvider {
	readonly id = "anthropic";
	readonly name = "Anthropic Claude";
	readonly models = ANTHROPIC_MODELS;

	private apiKey: string;
	private baseUrl: string;
	private defaultModel: string;

	constructor(config: AIProviderConfig) {
		if (!config.apiKey) {
			throw new Error("Anthropic provider requires an API key");
		}
		this.apiKey = config.apiKey;
		this.baseUrl = config.baseUrl || "https://api.anthropic.com";
		this.defaultModel = config.defaultModel || "claude-sonnet-4-5";
	}

	async *generateText(params: GenerateTextParams): AsyncIterable<string> {
		const model = params.model || this.defaultModel;
		const response = await fetch(`${this.baseUrl}/v1/messages`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": this.apiKey,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model,
				max_tokens: params.maxTokens || 4096,
				temperature: params.temperature ?? 0.7,
				system: params.systemPrompt,
				messages: [{ role: "user", content: params.userPrompt }],
				stream: true,
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Anthropic API error ${response.status}: ${error}`);
		}

		const reader = response.body?.getReader();
		if (!reader) throw new Error("No response body");

		const decoder = new TextDecoder();
		let buffer = "";

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (!line.startsWith("data: ")) continue;
					const data = line.slice(6);
					if (data === "[DONE]") return;

					try {
						const event = JSON.parse(data) as {
							type: string;
							delta?: { type: string; text?: string };
						};
						if (event.type === "content_block_delta" && event.delta?.text) {
							yield event.delta.text;
						}
					} catch {
						// Skip malformed events
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}

	async generateTextComplete(params: GenerateTextParams): Promise<GenerationResult> {
		const model = params.model || this.defaultModel;
		const response = await fetch(`${this.baseUrl}/v1/messages`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": this.apiKey,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model,
				max_tokens: params.maxTokens || 4096,
				temperature: params.temperature ?? 0.7,
				system: params.systemPrompt,
				messages: [{ role: "user", content: params.userPrompt }],
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Anthropic API error ${response.status}: ${error}`);
		}

		const data = (await response.json()) as {
			content: Array<{ type: string; text: string }>;
			usage: { input_tokens: number; output_tokens: number };
		};
		const text = data.content
			.filter((block) => block.type === "text")
			.map((block) => block.text)
			.join("");

		return {
			text,
			tokensUsed: {
				input: data.usage.input_tokens,
				output: data.usage.output_tokens,
				total: data.usage.input_tokens + data.usage.output_tokens,
			},
			model,
		};
	}

	async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
		const result = await this.generateTextComplete({
			model: params.model,
			systemPrompt: `${params.systemPrompt}\n\nYou MUST respond with valid JSON matching this schema:\n${JSON.stringify(params.schema, null, 2)}`,
			userPrompt: params.userPrompt,
			maxTokens: 4096,
			temperature: 0.3,
		});

		const parsed = JSON.parse(result.text) as unknown;
		if (params.parse) {
			return params.parse(parsed);
		}
		return parsed as T;
	}

	async testConnection(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/v1/messages`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: this.defaultModel,
					max_tokens: 1,
					messages: [{ role: "user", content: "test" }],
				}),
			});
			return response.ok;
		} catch {
			return false;
		}
	}
}

export function createAnthropicProvider(config: AIProviderConfig): AIProvider {
	return new AnthropicProvider(config);
}
