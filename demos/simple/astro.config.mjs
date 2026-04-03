import node from "@astrojs/node";
import react from "@astrojs/react";
import { aiWriterPlugin } from "@emdash-cms/plugin-ai-writer";
import { auditLogPlugin } from "@emdash-cms/plugin-audit-log";
import { seoAnalyzerPlugin } from "@emdash-cms/plugin-seo-analyzer";
import { defineConfig } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";

export default defineConfig({
	output: "server",
	adapter: node({
		mode: "standalone",
	}),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: sqlite({ url: "file:./data/emdash.db" }),
			storage: local({
				directory: "./uploads",
				baseUrl: "/_emdash/api/media/file",
			}),
			plugins: [auditLogPlugin(), aiWriterPlugin(), seoAnalyzerPlugin()],
		}),
	],
	devToolbar: { enabled: false },
});
