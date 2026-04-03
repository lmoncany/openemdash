/**
 * BUBU — SEO Analyzer (Sandbox Entry)
 *
 * Hooks into content:afterSave to analyze SEO quality.
 * Provides both rule-based scoring and AI-powered suggestions.
 */

import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";

interface BubuConfig {
	enabled: boolean;
	provider: string;
	model: string;
	analyzeOnSave: boolean;
	schedule: string;
	minScoreAlert: number;
}

interface SeoScore {
	content_id: string;
	collection: string;
	title: string;
	analyzed_at: string;
	score: number; // 0-100
	issues: SeoIssue[];
	suggestions: string[];
}

interface SeoIssue {
	severity: "error" | "warning" | "info";
	category: string;
	message: string;
}

interface ContentSaveEvent {
	content: Record<string, unknown> & {
		id?: string | number;
		slug?: string;
		status?: string;
		title?: string;
		data?: Record<string, unknown>;
	};
	collection: string;
	isNew: boolean;
}

const DEFAULT_CONFIG: BubuConfig = {
	enabled: false,
	provider: "anthropic",
	model: "claude-sonnet-4-5",
	analyzeOnSave: true,
	schedule: "0 6 * * *", // 6 AM daily
	minScoreAlert: 50,
};

export default definePlugin({
	hooks: {
		"plugin:install": async (_event: unknown, ctx: PluginContext) => {
			await ctx.kv.set("config", DEFAULT_CONFIG);
			ctx.log.info("BUBU installed with default configuration");
		},

		"plugin:activate": async (_event: unknown, ctx: PluginContext) => {
			ctx.log.info("BUBU activated — watching for content changes");
			if (ctx.cron) {
				const config = ((await ctx.kv.get("config")) as BubuConfig) || DEFAULT_CONFIG;
				await ctx.cron.schedule("seo-audit", config.schedule);
			}
		},

		"plugin:deactivate": async (_event: unknown, ctx: PluginContext) => {
			ctx.log.info("BUBU deactivated");
			if (ctx.cron) {
				await ctx.cron.unschedule("seo-audit");
			}
		},

		"content:afterSave": {
			handler: async (event: ContentSaveEvent, ctx: PluginContext) => {
				const config = ((await ctx.kv.get("config")) as BubuConfig) || DEFAULT_CONFIG;
				if (!config.enabled || !config.analyzeOnSave) return;

				const contentId = String(event.content.id ?? "");
				if (!contentId) return;

				const title = (event.content.title as string) || (event.content.slug as string) || "";
				const body = extractTextContent(event.content.data);

				const score = analyzeContent(title, body, event.content.slug as string);
				score.content_id = contentId;
				score.collection = event.collection;
				score.title = title;
				score.analyzed_at = new Date().toISOString();

				try {
					await ctx.storage.scores!.put(`${contentId}-${Date.now()}`, score);
					ctx.log.info(
						`BUBU: ${event.collection}/${contentId} scored ${score.score}/100 (${score.issues.length} issues)`,
					);
				} catch (error) {
					ctx.log.error("BUBU: Failed to save score", error);
				}
			},
		},

		cron: {
			handler: async (event: { taskName: string }, ctx: PluginContext) => {
				if (event.taskName !== "seo-audit") return;

				const config = ((await ctx.kv.get("config")) as BubuConfig) || DEFAULT_CONFIG;
				if (!config.enabled) return;

				ctx.log.info("BUBU: Starting scheduled SEO audit");

				// NOTE: Full audit of all content will be wired when the AI provider
				// is available in plugin context. For now, log the intent.
				ctx.log.info("BUBU: Scheduled audit would scan all published content");
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
				};

				if (interaction.type === "page_load" && interaction.page === "/dashboard") {
					return buildDashboardBlocks(ctx);
				}

				if (interaction.type === "page_load" && interaction.page === "/settings") {
					return buildSettingsBlocks(ctx);
				}

				if (interaction.type === "page_load" && interaction.page === "widget:seo-overview") {
					return buildWidgetBlocks(ctx);
				}

				return { blocks: [] };
			},
		},
	},
});

// ── Rule-based SEO Analysis ──

const WORD_SPLIT_RE = /\s+/;
const SENTENCE_SPLIT_RE = /[.!?]+/;
const PARAGRAPH_SPLIT_RE = /\n\s*\n/;
const HEADING_RE = /^#{1,6}\s/gm;

function analyzeContent(title: string, body: string, slug?: string): SeoScore {
	const issues: SeoIssue[] = [];
	let score = 100;

	// Title checks
	if (!title) {
		issues.push({ severity: "error", category: "title", message: "Missing title" });
		score -= 25;
	} else {
		if (title.length < 30) {
			issues.push({
				severity: "warning",
				category: "title",
				message: `Title too short (${title.length} chars, aim for 50-60)`,
			});
			score -= 10;
		}
		if (title.length > 70) {
			issues.push({
				severity: "warning",
				category: "title",
				message: `Title too long (${title.length} chars, max 60 for SERP)`,
			});
			score -= 5;
		}
	}

	// Content length
	const wordCount = body.split(WORD_SPLIT_RE).filter(Boolean).length;
	if (wordCount < 300) {
		issues.push({
			severity: "error",
			category: "content",
			message: `Content too short (${wordCount} words, aim for 1000+)`,
		});
		score -= 20;
	} else if (wordCount < 800) {
		issues.push({
			severity: "warning",
			category: "content",
			message: `Content could be longer (${wordCount} words, aim for 1000+)`,
		});
		score -= 10;
	}

	// Readability: sentence length
	const sentences = body.split(SENTENCE_SPLIT_RE).filter((s) => s.trim().length > 0);
	if (sentences.length > 0) {
		const avgSentenceLength = wordCount / sentences.length;
		if (avgSentenceLength > 25) {
			issues.push({
				severity: "warning",
				category: "readability",
				message: `Average sentence length is ${Math.round(avgSentenceLength)} words (aim for <20)`,
			});
			score -= 10;
		}
	}

	// Paragraph check
	const paragraphs = body.split(PARAGRAPH_SPLIT_RE).filter((p) => p.trim().length > 0);
	if (paragraphs.length < 3 && wordCount > 300) {
		issues.push({
			severity: "warning",
			category: "readability",
			message: "Content needs more paragraph breaks for readability",
		});
		score -= 5;
	}

	// Slug check
	if (slug && slug.length > 75) {
		issues.push({
			severity: "info",
			category: "url",
			message: `URL slug is long (${slug.length} chars)`,
		});
		score -= 3;
	}

	// Heading check (basic: look for markdown-style headings)
	const headings = body.match(HEADING_RE) || [];
	if (wordCount > 500 && headings.length === 0) {
		issues.push({
			severity: "warning",
			category: "structure",
			message: "No headings found. Use subheadings to structure long content.",
		});
		score -= 10;
	}

	return {
		content_id: "",
		collection: "",
		title,
		analyzed_at: "",
		score: Math.max(0, score),
		issues,
		suggestions: [],
	};
}

function extractTextContent(data?: Record<string, unknown>): string {
	if (!data) return "";

	// Try common content field names
	for (const key of ["content", "body", "text", "description"]) {
		const value = data[key];
		if (typeof value === "string") return value;
		// Portable Text: extract text from blocks
		if (Array.isArray(value)) {
			return value
				.filter(
					(block: unknown): block is { _type: string; children?: Array<{ text: string }> } =>
						typeof block === "object" && block !== null && "_type" in block,
				)
				.flatMap((block) => (block.children || []).map((child) => child.text).filter(Boolean))
				.join("\n\n");
		}
	}
	return "";
}

// ── Admin UI Blocks ──

async function buildDashboardBlocks(ctx: PluginContext) {
	const scores = await ctx.storage.scores!.query({
		orderBy: { analyzed_at: "desc" },
		limit: 20,
	});

	const entries = scores.items.map((item: { id: string; data: unknown }) => {
		const s = item.data as SeoScore;
		return {
			title: s.title || s.content_id,
			collection: s.collection,
			score: String(s.score),
			issues: String(s.issues.length),
			analyzed: s.analyzed_at,
		};
	});

	return {
		blocks: [
			{ type: "header", text: "BUBU — SEO Dashboard" },
			{ type: "context", text: "Content SEO health at a glance" },
			{ type: "divider" },
			{
				type: "table",
				blockId: "seo-scores",
				columns: [
					{ key: "title", label: "Content", format: "text" },
					{ key: "collection", label: "Collection", format: "text" },
					{ key: "score", label: "Score", format: "badge" },
					{ key: "issues", label: "Issues", format: "text" },
					{ key: "analyzed", label: "Analyzed", format: "relative_time" },
				],
				rows: entries,
				emptyText: "No content analyzed yet. BUBU will score content when it's saved.",
			},
		],
	};
}

async function buildSettingsBlocks(ctx: PluginContext) {
	const config = ((await ctx.kv.get("config")) as BubuConfig) || DEFAULT_CONFIG;
	return {
		blocks: [
			{ type: "header", text: "BUBU — Settings" },
			{
				type: "context",
				text: config.enabled ? "Status: Active" : "Status: Disabled",
			},
			{ type: "divider" },
			{
				type: "fields",
				fields: [
					{ label: "Analyze on save", value: config.analyzeOnSave ? "Yes" : "No" },
					{ label: "AI Provider", value: config.provider },
					{ label: "Model", value: config.model },
					{ label: "Schedule", value: config.schedule },
					{ label: "Min score alert", value: String(config.minScoreAlert) },
				],
			},
		],
	};
}

async function buildWidgetBlocks(ctx: PluginContext) {
	const scores = await ctx.storage.scores!.query({
		orderBy: { analyzed_at: "desc" },
		limit: 5,
	});

	const entries = scores.items.map((item: { id: string; data: unknown }) => {
		const s = item.data as SeoScore;
		return { label: s.title || s.content_id, value: `${s.score}/100` };
	});

	return {
		blocks: [
			{
				type: "fields",
				fields:
					entries.length > 0 ? entries : [{ label: "Status", value: "No content scored yet" }],
			},
		],
	};
}
