/**
 * defineAgent() Helper
 *
 * Wraps definePlugin() to provide agent-specific defaults and types.
 * An agent is a plugin with a scheduled cron run, optional chat capability,
 * and built-in storage for runs and config.
 */

import { definePlugin } from "./define-plugin.js";
import type { CronEvent, PluginContext, PluginStorageConfig, ResolvedPlugin } from "./types.js";

// =============================================================================
// Agent Types
// =============================================================================

/**
 * Context available during a scheduled agent run.
 * Extends PluginContext with agent identity and run metadata.
 */
export interface AgentRunContext extends PluginContext {
	agent: {
		name: string;
		role: string;
		personality: string;
		model: string;
		provider: string;
	};
	run: {
		id: string;
		trigger: "cron" | "manual";
	};
}

/**
 * Context available when a user chats with the agent.
 * Extends AgentRunContext with the user's message.
 */
export interface AgentChatContext extends AgentRunContext {
	message: string;
}

/**
 * Agent definition -- input to defineAgent().
 */
export interface AgentDefinition {
	/** Display name for the agent (e.g., "Toto") */
	name: string;
	/** Agent's role description (e.g., "Content Writer") */
	role: string;
	/** Emoji or URL for the agent's avatar */
	avatar: string;
	/** System prompt template defining the agent's personality */
	defaultPersonality: string;
	/** Cron expression for the default schedule (e.g., "0 9 * * *") */
	defaultSchedule: string;
	/** Model identifier (e.g., "anthropic/claude-sonnet-4-5") */
	defaultModel: string;
	/** Provider name (e.g., "anthropic") */
	defaultProvider: string;
	/** Maximum tokens per run (default: 10000) */
	maxTokensPerRun?: number;
	/** Monthly token budget (default: 500000) */
	monthlyTokenBudget?: number;

	/** Standard plugin hooks */
	hooks?: Record<string, unknown>;

	/** Called on each scheduled cron run */
	onRun: (ctx: AgentRunContext) => Promise<void>;

	/** Called when a user chats with this agent */
	onChat?: (ctx: AgentChatContext) => AsyncIterable<string>;
}

// =============================================================================
// Storage schema for agent runs and config
// =============================================================================

const NON_ALPHANUM = /[^a-z0-9]+/g;

const AGENT_STORAGE = {
	runs: {
		indexes: ["trigger", "createdAt"],
	},
	config: {
		indexes: ["key"],
	},
} satisfies PluginStorageConfig;

// =============================================================================
// defineAgent()
// =============================================================================

/**
 * Define an EmDash agent.
 *
 * Wraps definePlugin() to set up agent-specific defaults: a cron hook that
 * delegates to `onRun`, built-in storage collections for runs and config,
 * and agent metadata embedded in the plugin definition.
 *
 * @example
 * ```typescript
 * import { defineAgent } from "emdash";
 *
 * export default defineAgent({
 *   name: "Toto",
 *   role: "Content Writer",
 *   avatar: "✍️",
 *   defaultPersonality: "You are a helpful content writer...",
 *   defaultSchedule: "0 9 * * *",
 *   defaultModel: "anthropic/claude-sonnet-4-5",
 *   defaultProvider: "anthropic",
 *   onRun: async (ctx) => {
 *     ctx.log.info(`Agent ${ctx.agent.name} running`);
 *   },
 * });
 * ```
 */
export function defineAgent(definition: AgentDefinition): ResolvedPlugin<typeof AGENT_STORAGE> {
	const {
		name,
		role,
		avatar,
		defaultPersonality,
		defaultSchedule,
		defaultModel,
		defaultProvider,
		maxTokensPerRun = 10_000,
		monthlyTokenBudget = 500_000,
		hooks = {},
		onRun,
		onChat,
	} = definition;

	const agentId = `agent-${name.toLowerCase().replace(NON_ALPHANUM, "-")}`;

	const agentMeta = {
		name,
		role,
		avatar,
		personality: defaultPersonality,
		model: defaultModel,
		provider: defaultProvider,
		schedule: defaultSchedule,
		maxTokensPerRun,
		monthlyTokenBudget,
		hasChat: onChat !== undefined,
	};

	return definePlugin({
		id: agentId,
		version: "0.1.0",
		capabilities: [],
		storage: AGENT_STORAGE,
		hooks: {
			...hooks,
			cron: {
				handler: async (event: CronEvent, ctx: PluginContext) => {
					const runCtx: AgentRunContext = {
						...ctx,
						agent: {
							name,
							role,
							personality: defaultPersonality,
							model: defaultModel,
							provider: defaultProvider,
						},
						run: {
							id: event.scheduledAt,
							trigger: (event.data?.trigger as "cron" | "manual") ?? "cron",
						},
					};

					await onRun(runCtx);
				},
			},
		},
		routes: {
			...(onChat
				? {
						chat: {
							handler: async (routeCtx) => {
								const body =
									typeof routeCtx.input === "object" && routeCtx.input !== null
										? (routeCtx.input as Record<string, unknown>)
										: {};
								const message = typeof body.message === "string" ? body.message : "";

								const chatCtx: AgentChatContext = {
									...(routeCtx as unknown as PluginContext),
									agent: {
										name,
										role,
										personality: defaultPersonality,
										model: defaultModel,
										provider: defaultProvider,
									},
									run: {
										id: new Date().toISOString(),
										trigger: "manual",
									},
									message,
								};

								const chunks: string[] = [];
								for await (const chunk of onChat(chatCtx)) {
									chunks.push(chunk);
								}
								return { response: chunks.join("") };
							},
						},
					}
				: {}),
			metadata: {
				handler: async () => agentMeta,
			},
		},
		admin: {
			settingsSchema: {
				personality: {
					type: "string",
					label: "Personality",
					description: "System prompt template for this agent",
					default: defaultPersonality,
					multiline: true,
				},
				schedule: {
					type: "string",
					label: "Schedule",
					description: "Cron expression for scheduled runs",
					default: defaultSchedule,
				},
				model: {
					type: "string",
					label: "Model",
					description: "AI model identifier",
					default: defaultModel,
				},
				provider: {
					type: "string",
					label: "Provider",
					description: "AI provider name",
					default: defaultProvider,
				},
				maxTokensPerRun: {
					type: "number",
					label: "Max Tokens Per Run",
					description: "Maximum tokens consumed per run",
					default: maxTokensPerRun,
				},
				monthlyTokenBudget: {
					type: "number",
					label: "Monthly Token Budget",
					description: "Maximum tokens consumed per month",
					default: monthlyTokenBudget,
				},
			},
		},
	});
}

export default defineAgent;
