/**
 * Toto — AI Content Writer Agent
 *
 * An AI-powered content writer that generates blog posts on a schedule.
 * Uses the configured AI provider (BYOK) to create draft content.
 *
 * Features:
 * - Cron-scheduled content generation
 * - Configurable topics, tone, and target collections
 * - All generated content starts as ai_draft status
 * - Token usage tracking per run
 * - Admin page for configuration and run history
 */

import type { PluginDescriptor } from "emdash";

export function aiWriterPlugin(): PluginDescriptor {
	return {
		id: "ai-writer",
		version: "0.1.0",
		format: "standard",
		entrypoint: "@emdash-cms/plugin-ai-writer/sandbox",
		capabilities: ["write:content", "read:content"],
		storage: {
			runs: { indexes: ["started_at", "status", "agent_id"] },
			config: { indexes: [] },
		},
		adminPages: [
			{ path: "/settings", label: "Toto Settings", icon: "robot" },
			{ path: "/history", label: "Run History", icon: "history" },
		],
		adminWidgets: [{ id: "toto-status", title: "Toto — AI Writer", size: "half" }],
	};
}
