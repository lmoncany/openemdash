/**
 * AI agent chat endpoint - SSE streaming
 *
 * POST /_emdash/api/ai/chat
 *
 * Streams AI responses back via Server-Sent Events. Each token is sent as a
 * `data:` frame; completion sends an `event: done` frame with token usage;
 * failures send an `event: error` frame.
 */

import type { APIRoute } from "astro";
import { sql } from "kysely";
import { ulid } from "ulidx";
import { z } from "zod";

import { requirePerm } from "#api/authorize.js";
import { apiError } from "#api/error.js";
import { isParseError, parseBody } from "#api/parse.js";

export const prerender = false;

const chatBody = z.object({
	agentId: z.string().min(1),
	message: z.string().min(1),
	providerId: z.string().optional(),
	model: z.string().optional(),
});

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

	const { agentId, message, providerId, model } = body;

	// ── Resolve AI provider ──
	const ai = (emdash as Record<string, unknown>).ai;
	if (!ai || typeof ai !== "object") {
		return apiError("NOT_CONFIGURED", "AI provider is not configured", 500);
	}

	// ── Create run record ──
	const runId = ulid();
	const db = (emdash as Record<string, unknown>).db;
	if (db && typeof db === "object" && "insertInto" in db) {
		try {
			// eslint-disable-next-line typescript-eslint(no-unsafe-type-assertion) -- runtime narrowed above
			const kysely = db as import("kysely").Kysely<unknown>;
			await sql`
				INSERT INTO _emdash_agent_runs (id, agent_id, status, trigger)
				VALUES (${runId}, ${agentId}, 'running', 'chat')
			`.execute(kysely);
		} catch {
			// Non-fatal -- continue even if logging fails
		}
	}

	// ── Stream SSE ──
	let tokensUsed = 0;

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
				// eslint-disable-next-line typescript-eslint(no-unsafe-type-assertion) -- runtime narrowed above
				const registry = ai as {
					streamChat: (opts: {
						agentId: string;
						message: string;
						providerId?: string;
						model?: string;
						onToken: (token: string) => void;
					}) => Promise<{ tokensUsed: number }>;
				};

				const result = await registry.streamChat({
					agentId,
					message,
					providerId,
					model,
					onToken(token: string) {
						send(token);
					},
				});

				tokensUsed = result.tokensUsed;
				send(JSON.stringify({ tokensUsed }), "done");
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : "An unexpected error occurred";
				console.error("[AI_CHAT_ERROR]", err);
				send(JSON.stringify({ message: errorMessage }), "error");
			} finally {
				// ── Update run record ──
				if (db && typeof db === "object" && "insertInto" in db) {
					try {
						// eslint-disable-next-line typescript-eslint(no-unsafe-type-assertion) -- runtime narrowed above
						const kysely = db as import("kysely").Kysely<unknown>;
						await sql`
							UPDATE _emdash_agent_runs
							SET status = 'completed',
								completed_at = datetime('now'),
								tokens_used = ${tokensUsed},
								model_used = ${model ?? null}
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
