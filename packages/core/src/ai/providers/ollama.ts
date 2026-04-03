/**
 * Ollama AI Provider
 *
 * Implements the AIProvider interface for local Ollama models.
 * No API key required — connects to a local Ollama instance.
 */

import type {
	AIModel,
	AIProvider,
	AIProviderConfig,
	GenerateTextParams,
	GenerateStructuredParams,
	GenerationResult,
} from "../types.js";

export class OllamaProvider implements AIProvider {
	readonly id = "ollama";
	readonly name = "Ollama (Local)";
	models: AIModel[] = [];

	private baseUrl: string;
	private defaultModel: string;

	constructor(config: AIProviderConfig) {
		this.baseUrl = config.baseUrl || "http://localhost:11434";
		this.defaultModel = config.defaultModel || "llama3.2";
	}

	async *generateText(params: GenerateTextParams): AsyncIterable<string> {
		const model = params.model || this.defaultModel;
		const response = await fetch(`${this.baseUrl}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model,
				messages: [
					{ role: "system", content: params.systemPrompt },
					{ role: "user", content: params.userPrompt },
				],
				options: {
					num_predict: params.maxTokens || 4096,
					temperature: params.temperature ?? 0.7,
				},
				stream: true,
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Ollama API error ${response.status}: ${error}`);
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
					if (!line.trim()) continue;
					try {
						const event = JSON.parse(line) as {
							message?: { content?: string };
							done?: boolean;
						};
						if (event.message?.content) {
							yield event.message.content;
						}
						if (event.done) return;
					} catch {
						// Skip malformed lines
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}

	async generateTextComplete(params: GenerateTextParams): Promise<GenerationResult> {
		const model = params.model || this.defaultModel;
		const response = await fetch(`${this.baseUrl}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model,
				messages: [
					{ role: "system", content: params.systemPrompt },
					{ role: "user", content: params.userPrompt },
				],
				options: {
					num_predict: params.maxTokens || 4096,
					temperature: params.temperature ?? 0.7,
				},
				stream: false,
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`Ollama API error ${response.status}: ${error}`);
		}

		const data = (await response.json()) as {
			message: { content: string };
			eval_count?: number;
			prompt_eval_count?: number;
		};

		const inputTokens = data.prompt_eval_count || 0;
		const outputTokens = data.eval_count || 0;

		return {
			text: data.message.content,
			tokensUsed: {
				input: inputTokens,
				output: outputTokens,
				total: inputTokens + outputTokens,
			},
			model,
		};
	}

	async generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T> {
		const result = await this.generateTextComplete({
			model: params.model,
			systemPrompt: `${params.systemPrompt}\n\nYou MUST respond with valid JSON matching this schema:\n${JSON.stringify(params.schema, null, 2)}\n\nRespond ONLY with the JSON object, no other text.`,
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
			const response = await fetch(`${this.baseUrl}/api/tags`);
			if (!response.ok) return false;

			// Also refresh available models
			const data = (await response.json()) as {
				models: Array<{ name: string; details?: { parameter_size?: string } }>;
			};
			this.models = data.models.map((m) => ({
				id: m.name,
				name: m.name,
				contextWindow: 8192, // Ollama doesn't expose this directly
				supportsStreaming: true,
			}));

			return true;
		} catch {
			return false;
		}
	}
}

export function createOllamaProvider(config: AIProviderConfig): AIProvider {
	return new OllamaProvider(config);
}
