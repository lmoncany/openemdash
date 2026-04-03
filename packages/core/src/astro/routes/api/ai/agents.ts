/**
 * Agent dashboard: list registered agent plugins
 *
 * GET /_emdash/api/ai/agents - List all registered agent plugins with config and last run status
 */

import type { APIRoute } from "astro";
import { sql } from "kysely";

import { requirePerm } from "#api/authorize.js";
import { apiError, apiSuccess, handleError } from "#api/error.js";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
	const { emdash, user } = locals;

	if (!emdash?.db) {
		return apiError("NOT_CONFIGURED", "EmDash is not initialized", 500);
	}

	const denied = requirePerm(user, "plugins:read");
	if (denied) return denied;

	try {
		// Fetch agent plugin configs from plugin state
		const agents = await emdash.db
			.selectFrom("_plugin_state")
			.select(["plugin_id", "status", "display_name", "data", "activated_at", "deactivated_at"])
			.where("plugin_id", "like", "agent-%")
			.execute();

		// Fetch most recent run for each agent in a single query
		const lastRuns = await sql<{
			agent_id: string;
			id: string;
			status: string;
			started_at: string;
			completed_at: string | null;
			error_message: string | null;
		}>`
			SELECT r.agent_id, r.id, r.status, r.started_at, r.completed_at, r.error_message
			FROM _emdash_agent_runs r
			INNER JOIN (
				SELECT agent_id, MAX(started_at) AS max_started
				FROM _emdash_agent_runs
				GROUP BY agent_id
			) latest ON r.agent_id = latest.agent_id AND r.started_at = latest.max_started
		`.execute(emdash.db);

		const lastRunMap = new Map(lastRuns.rows.map((r) => [r.agent_id, r]));

		const items = agents.map((agent) => {
			const config = agent.data ? JSON.parse(agent.data) : {};
			const lastRun = lastRunMap.get(agent.plugin_id);

			return {
				id: agent.plugin_id,
				name: agent.display_name ?? config.name ?? agent.plugin_id,
				role: config.role ?? null,
				avatar: config.avatar ?? null,
				enabled: agent.status === "active",
				schedule: config.schedule ?? null,
				lastRun: lastRun
					? {
							id: lastRun.id,
							status: lastRun.status,
							startedAt: lastRun.started_at,
							completedAt: lastRun.completed_at,
							errorMessage: lastRun.error_message,
						}
					: null,
			};
		});

		return apiSuccess({ items });
	} catch (error) {
		return handleError(error, "Failed to list agents", "AGENT_LIST_ERROR");
	}
};
