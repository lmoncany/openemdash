/**
 * AI Copilot API functions
 *
 * Handles SSE streaming chat and agent/provider queries.
 */

import { useQuery } from "@tanstack/react-query";

import { API_BASE, apiFetch, parseApiResponse } from "./client";

// ── Types ──

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: string;
}

export interface AgentInfo {
	id: string;
	name: string;
	role: string | null;
	avatar: string | null;
	enabled: boolean;
	schedule: string | null;
	lastRun: {
		id: string;
		status: string;
		startedAt: string;
		completedAt: string | null;
		errorMessage: string | null;
	} | null;
}

export interface ProviderInfo {
	id: string;
	name: string;
	models: Array<{ id: string; name: string }>;
	configured: boolean;
}

// ── Streaming Chat ──

export interface StreamChatOptions {
	agentId: string;
	message: string;
	onToken: (token: string) => void;
	onDone: (data: { tokensUsed: number }) => void;
	onError: (message: string) => void;
	signal?: AbortSignal;
}

/**
 * Stream a chat response from the AI endpoint via SSE.
 * Calls onToken for each chunk, onDone when complete, onError on failure.
 */
export async function streamChat({
	agentId,
	message,
	onToken,
	onDone,
	onError,
	signal,
}: StreamChatOptions): Promise<void> {
	const response = await apiFetch(`${API_BASE}/ai/chat`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ agentId, message }),
		signal,
	});

	if (!response.ok) {
		const body: unknown = await response.json().catch(() => ({}));
		const msg =
			typeof body === "object" &&
			body !== null &&
			"error" in body &&
			typeof (body as Record<string, unknown>).error === "object"
				? ((body as Record<string, Record<string, unknown>>).error?.message as string)
				: "Chat request failed";
		onError(msg || "Chat request failed");
		return;
	}

	const reader = response.body?.getReader();
	if (!reader) {
		onError("No response stream");
		return;
	}

	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			// Keep the last potentially incomplete line in the buffer
			buffer = lines.pop() ?? "";

			let currentEvent = "";
			for (const line of lines) {
				if (line.startsWith("event: ")) {
					currentEvent = line.slice(7).trim();
				} else if (line.startsWith("data: ")) {
					const data = line.slice(6);
					if (currentEvent === "done") {
						try {
							onDone(JSON.parse(data));
						} catch {
							onDone({ tokensUsed: 0 });
						}
					} else if (currentEvent === "error") {
						try {
							const parsed = JSON.parse(data) as { message?: string };
							onError(parsed.message ?? "Unknown error");
						} catch {
							onError(data);
						}
					} else {
						// Regular token
						onToken(data);
					}
					currentEvent = "";
				} else if (line === "") {
					// Empty line resets event
					currentEvent = "";
				}
			}
		}
	} finally {
		reader.releaseLock();
	}
}

// ── Query Hooks ──

export function useAgents() {
	return useQuery({
		queryKey: ["ai", "agents"],
		queryFn: async () => {
			const res = await apiFetch(`${API_BASE}/ai/agents`);
			return parseApiResponse<{ items: AgentInfo[] }>(res, "Failed to fetch agents");
		},
		staleTime: 30_000,
	});
}

export function useProviders() {
	return useQuery({
		queryKey: ["ai", "providers"],
		queryFn: async () => {
			const res = await apiFetch(`${API_BASE}/ai/providers`);
			return parseApiResponse<{ providers: ProviderInfo[] }>(res, "Failed to fetch providers");
		},
		staleTime: 60_000,
	});
}
