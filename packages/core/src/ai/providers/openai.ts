/**
 * OpenAI AI Provider
 *
 * Implements the AIProvider interface for OpenAI's GPT models.
 * Uses the raw fetch API — no SDK dependency required.
 */

import type {
	AIModel,
	AIProvider,
	AIProviderConfig,
	GenerateTextParams,
	GenerateStructuredParams,
	GenerationResult,
} from "../types.js";

const OPENAI_MODELS: AIModel[] = [
	{ id: "gpt-4o", name: "GPT-4o", contextWindow: 128_000, supportsStreaming: true },
	{ id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128_000, supportsStreaming: true },
	{ id: "gpt-4-turbo", name: "GPT-4 Turbo", contextWindow: 128_000, supportsStreaming: true },
];

export class OpenAIProvider implements AIProvider {
	readonly id = "openai";
	readonly name = "OpenAI";
	readonly models = OPENAI_MODELS;

	private apiKey: string;
	private baseUrl: string;
	private defaultModel: string;

	constructor(config: AIProviderConfig) {
		if (!config.apiKey) {
			throw new Error("OpenAI provider requires an API key");
		}
		this.apiKey = config.apiKey;
		this.baseUrl = config.baseUrl || "https://api.openai.com";
		this.defaultModel = config.defaultModel || "gpt-4o";
	}

	async *generateText(params: GenerateTextParams): AsyncIterable<string> {
		const model = params.model || this.defaultModel;
		const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model,
				max_tokens: params.maxTokens || 4096,
				temperature: params.temperature ?? 0.7,
				messages: [
					{ role: "system", content: params.systemPrompt },
					{ role: "user", content: params.userPrompt },
				],
				stream: true,
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`OpenAI API error ${response.status}: ${error}`);
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
							choices: Array<{ delta: { content?: string } }>;
						};
						const content = event.choices[0]?.delta?.content;
						if (content) yield content;
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
		const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model,
				max_tokens: params.maxTokens || 4096,
				temperature: params.temperature ?? 0.7,
				messages: [
					{ role: "system", content: params.systemPrompt },
					{ role: "user", content: params.userPrompt },
				],
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`OpenAI API error ${response.status}: ${error}`);
		}

		const data = (await response.json()) as {
			choices: Array<{ message: { content: string } }>;
			usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
		};

		return {
			text: data.choices[0]?.message.content || "",
			tokensUsed: {
				input: data.usage.prompt_tokens,
				output: data.usage.completion_tokens,
				total: data.usage.total_tokens,
			},
			model,
		};
	}

	async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
		const model = params.model || this.defaultModel;
		const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model,
				max_tokens: 4096,
				temperature: 0.3,
				messages: [
					{ role: "system", content: params.systemPrompt },
					{ role: "user", content: params.userPrompt },
				],
				response_format: {
					type: "json_schema",
					json_schema: { name: "response", schema: params.schema },
				},
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`OpenAI API error ${response.status}: ${error}`);
		}

		const data = (await response.json()) as {
			choices: Array<{ message: { content: string } }>;
		};

		const parsed = JSON.parse(data.choices[0]?.message.content || "{}") as unknown;
		if (params.parse) {
			return params.parse(parsed);
		}
		return parsed as T;
	}

	async testConnection(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl}/v1/models`, {
				headers: { Authorization: `Bearer ${this.apiKey}` },
			});
			return response.ok;
		} catch {
			return false;
		}
	}
}

export function createOpenAIProvider(config: AIProviderConfig): AIProvider {
	return new OpenAIProvider(config);
}
