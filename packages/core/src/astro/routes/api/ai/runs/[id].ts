/**
 * Single agent run detail endpoint
 *
 * GET /_emdash/api/ai/runs/:id - Get full run details including content_ids and error_message
 */

import type { APIRoute } from "astro";
import { sql } from "kysely";

import { requirePerm } from "#api/authorize.js";
import { apiError, apiSuccess, handleError } from "#api/error.js";

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
	const { emdash, user } = locals;
	const { id } = params;

	if (!emdash?.db) {
		return apiError("NOT_CONFIGURED", "EmDash is not initialized", 500);
	}

	const denied = requirePerm(user, "plugins:read");
	if (denied) return denied;

	if (!id) {
		return apiError("INVALID_REQUEST", "Run ID required", 400);
	}

	try {
		const result = await sql<{
			id: string;
			agent_id: string;
			status: string;
			started_at: string;
			completed_at: string | null;
			error_message: string | null;
			content_ids: string | null;
			tokens_used: number | null;
			model_used: string | null;
			trigger: string;
		}>`SELECT id, agent_id, status, started_at, completed_at, error_message, content_ids, tokens_used, model_used, "trigger"
			FROM _emdash_agent_runs
			WHERE id = ${id}`.execute(emdash.db);

		const row = result.rows[0];
		if (!row) {
			return apiError("NOT_FOUND", "Agent run not found", 404);
		}

		let contentIds: string[] = [];
		if (row.content_ids) {
			try {
				contentIds = JSON.parse(row.content_ids);
			} catch {
				contentIds = [];
			}
		}

		return apiSuccess({
			id: row.id,
			agentId: row.agent_id,
			status: row.status,
			startedAt: row.started_at,
			completedAt: row.completed_at,
			errorMessage: row.error_message,
			contentIds,
			tokensUsed: row.tokens_used,
			modelUsed: row.model_used,
			trigger: row.trigger,
		});
	} catch (error) {
		return handleError(error, "Failed to load agent run", "AGENT_RUN_ERROR");
	}
};
