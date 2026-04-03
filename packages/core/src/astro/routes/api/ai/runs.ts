/**
 * Agent run history endpoint
 *
 * GET /_emdash/api/ai/runs - List agent runs with optional filtering and cursor pagination
 */

import type { APIRoute } from "astro";
import { sql } from "kysely";

import { requirePerm } from "#api/authorize.js";
import { apiError, apiSuccess, handleError } from "#api/error.js";

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
	const { emdash, user } = locals;

	if (!emdash?.db) {
		return apiError("NOT_CONFIGURED", "EmDash is not initialized", 500);
	}

	const denied = requirePerm(user, "plugins:read");
	if (denied) return denied;

	try {
		const agentId = url.searchParams.get("agentId");
		const cursor = url.searchParams.get("cursor");
		const rawLimit = url.searchParams.get("limit");
		const limit = Math.min(Math.max(parseInt(rawLimit ?? "50", 10) || 50, 1), 100);

		// Build query with parameterized conditions; fetch one extra row to detect next page
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
			${agentId && cursor ? sql`WHERE agent_id = ${agentId} AND started_at < ${cursor}` : agentId ? sql`WHERE agent_id = ${agentId}` : cursor ? sql`WHERE started_at < ${cursor}` : sql``}
			ORDER BY started_at DESC
			LIMIT ${limit + 1}`.execute(emdash.db);

		const rows = result.rows;
		const hasMore = rows.length > limit;
		const items = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
			id: row.id,
			agentId: row.agent_id,
			status: row.status,
			startedAt: row.started_at,
			completedAt: row.completed_at,
			tokensUsed: row.tokens_used,
			modelUsed: row.model_used,
			trigger: row.trigger,
		}));

		const lastItem = items.at(-1);
		const nextCursor = hasMore && lastItem ? lastItem.startedAt : undefined;

		return apiSuccess({ items, nextCursor });
	} catch (error) {
		return handleError(error, "Failed to list agent runs", "AGENT_RUNS_ERROR");
	}
};
