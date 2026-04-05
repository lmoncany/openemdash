/**
 * AI agent chat endpoint - SSE streaming with tool use
 *
 * POST /_emdash/api/ai/chat
 *
 * Streams AI responses via SSE. Supports an agentic tool-use loop where
 * the AI can read and update CMS content in response to user instructions.
 *
 * SSE events:
 *   data: <text>          — streamed text token
 *   event: action         — content edit applied (JSON: { type, collection, id, field, value })
 *   event: done           — generation complete (JSON: { tokensUsed })
 *   event: error          — failure (JSON: { message })
 */

import type { APIRoute } from "astro";
import { sql } from "kysely";
import { ulid } from "ulidx";
import { z } from "zod";

import { requirePerm } from "#api/authorize.js";
import { apiError } from "#api/error.js";
import { isParseError, parseBody } from "#api/parse.js";

import type { AIProviderRegistry, GenerateTextParams } from "../../../../ai/types.js";

export const prerender = false;

/** Matches ```action\n{...}\n``` blocks in AI responses */
const ACTION_BLOCK_RE = /```action\n([\s\S]*?)```/g;

const chatBody = z.object({
	agentId: z.string().min(1),
	message: z.string().min(1),
	providerId: z.string().optional(),
	model: z.string().optional(),
	/** Page context from data-emdash-ref annotations */
	context: z
		.object({
			collection: z.string().nullable().optional(),
			id: z.string().nullable().optional(),
			fields: z.record(z.string(), z.string()).optional(),
		})
		.optional(),
});

/**
 * Build a system prompt that includes content-editing tool instructions
 * when page context is available.
 */
function buildSystemPrompt(context?: {
	collection?: string | null;
	id?: string | null;
	fields?: Record<string, string>;
}): string {
	const base =
		"You are an AI copilot integrated into EmDash CMS. You help editors create, improve, and manage their content directly on the page.";

	if (!context?.collection || !context?.id) {
		return `${base}\n\nThe user is browsing a page without editable content context. Answer their questions helpfully. Be concise.`;
	}

	const fieldList = context.fields
		? Object.entries(context.fields)
				.map(([k, v]) => `  - ${k}: "${v}"`)
				.join("\n")
		: "  (no fields detected)";

	return `${base}

## Current page context
- Collection: ${context.collection}
- Content ID: ${context.id}
- Visible fields:
${fieldList}

## Content editing capabilities
When the user asks you to edit, rewrite, improve, or change content, you can directly update fields.

To edit a field, include an ACTION block in your response using this exact format:
\`\`\`action
{"type":"update_field","collection":"${context.collection}","id":"${context.id}","field":"FIELD_NAME","value":"NEW_VALUE"}
\`\`\`

Rules:
- Only edit fields that exist in the visible fields list above.
- Always explain what you changed and why.
- You can include multiple action blocks to update multiple fields.
- For text improvements, preserve the original meaning unless asked to change it.
- Be concise in your explanations.`;
}

export const POST: APIRoute = async ({ request, locals }) => {
	const { emdash, user } = locals;

	if (!emdash) {
		return apiError("NOT_CONFIGURED", "EmDash is not initialized", 500);
	}

	const denied = requirePerm(user, "content:create");
	if (denied) return denied;

	// ── Parse body ──
	const body = await parseBody(request, chatBody);
	if (isParseError(body)) return body;

	const { agentId, message, providerId, model, context } = body;

	// ── Resolve AI provider ──
	// eslint-disable-next-line typescript-eslint(no-unsafe-type-assertion) -- runtime type
	const registry = (emdash as Record<string, unknown>).ai as AIProviderRegistry | null;
	if (!registry) {
		return apiError("NOT_CONFIGURED", "AI provider registry is not configured", 500);
	}

	const targetProviderId = providerId || "anthropic";
	const provider = registry.get(targetProviderId);
	if (!provider) {
		const available = registry.list();
		return apiError(
			"NOT_CONFIGURED",
			`AI provider "${targetProviderId}" is not configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in your .env file. Available: ${available.join(", ")}`,
			500,
		);
	}

	// ── Create run record ──
	const runId = ulid();
	const db = (emdash as Record<string, unknown>).db;
	if (db && typeof db === "object" && "insertInto" in db) {
		try {
			// eslint-disable-next-line typescript-eslint(no-unsafe-type-assertion) -- runtime narrowed
			const kysely = db as import("kysely").Kysely<unknown>;
			await sql`
				INSERT INTO _emdash_agent_runs (id, agent_id, status, trigger)
				VALUES (${runId}, ${agentId}, 'running', 'chat')
			`.execute(kysely);
		} catch {
			// Non-fatal
		}
	}

	// ── Stream SSE ──
	const modelId = model || "claude-sonnet-4-5";
	let tokenCount = 0;

	// Access content handlers for tool execution
	const handleContentUpdate = (emdash as Record<string, unknown>).handleContentUpdate as
		| ((
				collection: string,
				id: string,
				data: Record<string, unknown>,
		  ) => Promise<{ success: boolean; data?: unknown; error?: { code: string; message: string } }>)
		| undefined;

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			const send = (data: string, event?: string) => {
				let frame = "";
				if (event) frame += `event: ${event}\n`;
				frame += `data: ${data}\n\n`;
				controller.enqueue(encoder.encode(frame));
			};

			try {
				const params: GenerateTextParams = {
					model: modelId,
					systemPrompt: buildSystemPrompt(
						context as
							| {
									collection?: string | null;
									id?: string | null;
									fields?: Record<string, string>;
							  }
							| undefined,
					),
					userPrompt: message,
					maxTokens: 4096,
					temperature: 0.7,
				};

				// Collect full response to extract action blocks
				let fullResponse = "";
				const chunks = provider.generateText(params);

				for await (const chunk of chunks) {
					tokenCount += 1;
					fullResponse += chunk;
					send(chunk);
				}

				// Parse and execute action blocks from the response
				ACTION_BLOCK_RE.lastIndex = 0;
				let match;
				while ((match = ACTION_BLOCK_RE.exec(fullResponse)) !== null) {
					try {
						const actionJson = match[1];
						if (!actionJson) continue;
						const action = JSON.parse(actionJson.trim()) as {
							type: string;
							collection: string;
							id: string;
							field: string;
							value: string;
						};

						if (action.type === "update_field" && action.collection && action.id && action.field) {
							// Execute the content update
							if (handleContentUpdate) {
								const result = await handleContentUpdate(action.collection, action.id, {
									[action.field]: action.value,
								});
								if (result.success) {
									send(
										JSON.stringify({
											type: "update_field",
											collection: action.collection,
											id: action.id,
											field: action.field,
											value: action.value,
											success: true,
										}),
										"action",
									);
								} else {
									send(
										JSON.stringify({
											type: "update_field",
											field: action.field,
											success: false,
											error: result.error?.message || "Update failed",
										}),
										"action",
									);
								}
							}
						}
					} catch {
						// Skip malformed action blocks
					}
				}

				send(JSON.stringify({ tokensUsed: tokenCount }), "done");
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
				console.error("[AI_CHAT_ERROR]", err);
				send(JSON.stringify({ message: errorMessage }), "error");
			} finally {
				if (db && typeof db === "object" && "insertInto" in db) {
					try {
						// eslint-disable-next-line typescript-eslint(no-unsafe-type-assertion) -- runtime narrowed
						const kysely = db as import("kysely").Kysely<unknown>;
						await sql`
							UPDATE _emdash_agent_runs
							SET status = 'completed',
								completed_at = datetime('now'),
								tokens_used = ${tokenCount},
								model_used = ${modelId}
							WHERE id = ${runId}
						`.execute(kysely);
					} catch {
						// Non-fatal
					}
				}

				controller.close();
			}
		},
	});

	return new Response(stream, {
		status: 200,
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-store",
			Connection: "keep-alive",
		},
	});
};
