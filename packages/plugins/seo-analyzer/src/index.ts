/**
 * BUBU — SEO Analyzer Agent
 *
 * Analyzes content for SEO quality. Runs as a hook on content:afterSave
 * and optionally on a cron schedule to audit existing content.
 *
 * Features:
 * - Title length and keyword analysis
 * - Meta description quality check
 * - Readability scoring (sentence length, paragraph structure)
 * - AI-powered improvement suggestions (via configured provider)
 * - SEO score tracking over time
 */

import type { PluginDescriptor } from "emdash";

export function seoAnalyzerPlugin(): PluginDescriptor {
	return {
		id: "seo-analyzer",
		version: "0.1.0",
		format: "standard",
		entrypoint: "@emdash-cms/plugin-seo-analyzer/sandbox",
		capabilities: ["read:content"],
		storage: {
			scores: { indexes: ["content_id", "analyzed_at", "score"] },
			config: { indexes: [] },
		},
		adminPages: [
			{ path: "/dashboard", label: "SEO Dashboard", icon: "chart" },
			{ path: "/settings", label: "BUBU Settings", icon: "settings" },
		],
		adminWidgets: [{ id: "seo-overview", title: "BUBU — SEO Health", size: "half" }],
	};
}
