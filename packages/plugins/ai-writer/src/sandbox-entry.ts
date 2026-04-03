/**
 * Toto — AI Content Writer (Sandbox Entry)
 *
 * Runs as a cron-scheduled plugin. On each tick:
 * 1. Reads the configured topic/prompt from settings
 * 2. Fetches recent content for context (avoid duplicates)
 * 3. Calls the AI provider to generate a blog post
 * 4. Creates the post as an ai_draft
 * 5. Logs the run with token usage
 */

import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";

interface TotoConfig {
	enabled: boolean;
	provider: string;
	model: string;
	personality: string;
	topics: string[];
	targetCollection: string;
	maxTokensPerRun: number;
	monthlyTokenBudget: number;
	schedule: string;
}

interface RunRecord {
	started_at: string;
	completed_at: string | null;
	status: "running" | "success" | "failed";
	agent_id: string;
	error_message: string | null;
	content_id: string | null;
	tokens_used: number;
	model_used: string;
	trigger: string;
}

const DEFAULT_PERSONALITY = `You are Toto, a skilled content writer. You write engaging, well-structured blog posts.
Your writing is clear, informative, and optimized for readability.
Use subheadings, short paragraphs, and concrete examples.
Write in a conversational but professional tone.`;

const DEFAULT_CONFIG: TotoConfig = {
	enabled: false,
	provider: "anthropic",
	model: "claude-sonnet-4-5",
	personality: DEFAULT_PERSONALITY,
	topics: [],
	targetCollection: "posts",
	maxTokensPerRun: 10_000,
	monthlyTokenBudget: 500_000,
	schedule: "0 2 * * *", // 2 AM daily
};

export default definePlugin({
	hooks: {
		"plugin:install": async (_event: unknown, ctx: PluginContext) => {
			// Store default config on install
			await ctx.kv.set("config", DEFAULT_CONFIG);
			ctx.log.info("Toto installed with default configuration");
		},

		"plugin:activate": async (_event: unknown, ctx: PluginContext) => {
			ctx.log.info("Toto activated — ready to write");
			// Register cron task
			if (ctx.cron) {
				const config = ((await ctx.kv.get("config")) as TotoConfig) || DEFAULT_CONFIG;
				await ctx.cron.schedule("write-content", config.schedule);
			}
		},

		"plugin:deactivate": async (_event: unknown, ctx: PluginContext) => {
			ctx.log.info("Toto deactivated");
			if (ctx.cron) {
				await ctx.cron.unschedule("write-content");
			}
		},

		cron: {
			handler: async (event: { taskName: string }, ctx: PluginContext) => {
				if (event.taskName !== "write-content") return;

				const config = ((await ctx.kv.get("config")) as TotoConfig) || DEFAULT_CONFIG;
				if (!config.enabled) {
					ctx.log.info("Toto is disabled, skipping run");
					return;
				}

				const runId = `run-${Date.now()}`;
				const run: RunRecord = {
					started_at: new Date().toISOString(),
					completed_at: null,
					status: "running",
					agent_id: "toto",
					error_message: null,
					content_id: null,
					tokens_used: 0,
					model_used: config.model,
					trigger: "cron",
				};

				try {
					await ctx.storage.runs!.put(runId, run);

					// Check monthly budget
					const monthStart = new Date();
					monthStart.setDate(1);
					monthStart.setHours(0, 0, 0, 0);

					const recentRuns = await ctx.storage.runs!.query({
						orderBy: { started_at: "desc" },
						limit: 100,
					});

					const monthlyTokens = recentRuns.items
						.filter((item: { data: unknown }) => {
							const r = item.data as RunRecord;
							return r.started_at >= monthStart.toISOString() && r.status === "success";
						})
						.reduce((sum: number, item: { data: unknown }) => {
							return sum + ((item.data as RunRecord).tokens_used || 0);
						}, 0);

					if (monthlyTokens >= config.monthlyTokenBudget) {
						run.status = "failed";
						run.error_message = "Monthly token budget exceeded";
						run.completed_at = new Date().toISOString();
						await ctx.storage.runs!.put(runId, run);
						ctx.log.info("Toto skipped: monthly token budget reached");
						return;
					}

					// Pick a topic
					const topic =
						config.topics.length > 0
							? config.topics[Math.floor(Math.random() * config.topics.length)]
							: "Write about something interesting and relevant to the site";

					// Get existing content titles for context
					let existingTitles = "";
					if (ctx.content) {
						try {
							const existing = await ctx.content.list(config.targetCollection, {
								limit: 20,
								orderBy: "created_at",
								order: "desc",
							});
							existingTitles = existing.items
								.map((item: Record<string, unknown>) => `- ${item.title as string}`)
								.join("\n");
						} catch {
							// Content API may not be available
						}
					}

					const systemPrompt = config.personality || DEFAULT_PERSONALITY;
					const userPrompt = buildPrompt(topic, existingTitles);

					// NOTE: In Phase 2, this would call the AI provider via the runtime's AI registry.
					// For now, we log the intent. The actual AI call will be wired when the
					// runtime exposes the AI registry to plugin context.
					ctx.log.info(`Toto would generate content for topic: ${topic}`);
					ctx.log.info(`System prompt: ${systemPrompt.slice(0, 100)}...`);
					ctx.log.info(`User prompt: ${userPrompt.slice(0, 200)}...`);

					// Mark run as successful (placeholder until AI integration)
					run.status = "success";
					run.completed_at = new Date().toISOString();
					run.tokens_used = 0;
					await ctx.storage.runs!.put(runId, run);

					ctx.log.info(`Toto run ${runId} completed`);
				} catch (error) {
					run.status = "failed";
					run.error_message = error instanceof Error ? error.message : "Unknown error";
					run.completed_at = new Date().toISOString();
					await ctx.storage.runs!.put(runId, run);
					ctx.log.error(`Toto run ${runId} failed:`, error);
				}
			},
		},
	},

	routes: {
		admin: {
			handler: async (
				routeCtx: { input: unknown; request: { url: string } },
				ctx: PluginContext,
			) => {
				const interaction = routeCtx.input as {
					type: string;
					page?: string;
					action_id?: string;
					value?: string;
				};

				if (interaction.type === "page_load" && interaction.page === "/settings") {
					return buildSettingsBlocks(ctx);
				}

				if (interaction.type === "page_load" && interaction.page === "/history") {
					return buildHistoryBlocks(ctx);
				}

				if (interaction.type === "page_load" && interaction.page === "widget:toto-status") {
					return buildWidgetBlocks(ctx);
				}

				return { blocks: [] };
			},
		},
	},
});

function buildPrompt(topic: string, existingTitles: string): string {
	let prompt = `Write a blog post about: ${topic}\n\n`;
	prompt += "Requirements:\n";
	prompt += "- 1,500-2,000 words\n";
	prompt += "- Engaging title\n";
	prompt += "- Clear introduction that hooks the reader\n";
	prompt += "- 3-5 subheadings organizing the content\n";
	prompt += "- Concrete examples and actionable advice\n";
	prompt += "- Strong conclusion with a call to action\n";

	if (existingTitles) {
		prompt += `\nExisting posts on this site (avoid duplicating topics):\n${existingTitles}\n`;
	}

	prompt += "\nRespond with JSON: { title: string, content: string, excerpt: string }";
	return prompt;
}

async function buildSettingsBlocks(ctx: PluginContext) {
	const config = ((await ctx.kv.get("config")) as TotoConfig) || DEFAULT_CONFIG;
	return {
		blocks: [
			{ type: "header", text: "Toto — AI Content Writer" },
			{
				type: "context",
				text: config.enabled ? "Status: Active" : "Status: Disabled",
			},
			{ type: "divider" },
			{
				type: "fields",
				fields: [
					{ label: "Provider", value: config.provider },
					{ label: "Model", value: config.model },
					{ label: "Schedule", value: config.schedule },
					{ label: "Target Collection", value: config.targetCollection },
					{ label: "Max Tokens/Run", value: String(config.maxTokensPerRun) },
					{ label: "Monthly Budget", value: String(config.monthlyTokenBudget) },
				],
			},
			{ type: "divider" },
			{
				type: "context",
				text: `Topics: ${config.topics.length > 0 ? config.topics.join(", ") : "(none configured)"}`,
			},
		],
	};
}

async function buildHistoryBlocks(ctx: PluginContext) {
	const runs = await ctx.storage.runs!.query({
		orderBy: { started_at: "desc" },
		limit: 50,
	});

	const entries = runs.items.map((item: { id: string; data: unknown }) => {
		const run = item.data as RunRecord;
		return {
			status: run.status,
			started: run.started_at,
			tokens: String(run.tokens_used || 0),
			model: run.model_used || "-",
			trigger: run.trigger || "cron",
		};
	});

	return {
		blocks: [
			{ type: "header", text: "Toto — Run History" },
			{ type: "divider" },
			{
				type: "table",
				blockId: "runs-table",
				columns: [
					{ key: "status", label: "Status", format: "badge" },
					{ key: "started", label: "Started", format: "relative_time" },
					{ key: "tokens", label: "Tokens", format: "text" },
					{ key: "model", label: "Model", format: "text" },
					{ key: "trigger", label: "Trigger", format: "text" },
				],
				rows: entries,
				emptyText: "No runs yet. Activate Toto to start generating content.",
			},
		],
	};
}

async function buildWidgetBlocks(ctx: PluginContext) {
	const config = ((await ctx.kv.get("config")) as TotoConfig) || DEFAULT_CONFIG;
	const runs = await ctx.storage.runs!.query({
		orderBy: { started_at: "desc" },
		limit: 3,
	});

	const recentRuns = runs.items.map((item: { id: string; data: unknown }) => {
		const run = item.data as RunRecord;
		return { label: run.status, value: run.started_at };
	});

	return {
		blocks: [
			{
				type: "context",
				text: config.enabled ? "Toto is active" : "Toto is disabled",
			},
			{
				type: "fields",
				fields: recentRuns.length > 0 ? recentRuns : [{ label: "Status", value: "No runs yet" }],
			},
		],
	};
}
