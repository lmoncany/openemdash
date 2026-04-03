/**
 * AI provider list endpoint
 *
 * GET /_emdash/api/ai/providers - List configured AI providers and their models (no secrets)
 */

import type { APIRoute } from "astro";

import { requirePerm } from "#api/authorize.js";
import { apiSuccess, handleError } from "#api/error.js";

export const prerender = false;

/**
 * Known AI providers with their default model catalogs.
 * The `configured` flag is determined at runtime by checking
 * whether the corresponding API key env var is set.
 */
const PROVIDER_CATALOG = [
	{
		id: "openai",
		name: "OpenAI",
		envKey: "OPENAI_API_KEY",
		models: [
			{ id: "gpt-4o", name: "GPT-4o" },
			{ id: "gpt-4o-mini", name: "GPT-4o Mini" },
			{ id: "gpt-4-turbo", name: "GPT-4 Turbo" },
		],
	},
	{
		id: "anthropic",
		name: "Anthropic",
		envKey: "ANTHROPIC_API_KEY",
		models: [
			{ id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
			{ id: "claude-haiku-4-20250514", name: "Claude Haiku 4" },
		],
	},
	{
		id: "google",
		name: "Google AI",
		envKey: "GOOGLE_API_KEY",
		models: [
			{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
			{ id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
		],
	},
] as const;

export const GET: APIRoute = async ({ locals }) => {
	const { user } = locals;

	const denied = requirePerm(user, "plugins:read");
	if (denied) return denied;

	try {
		const providers = PROVIDER_CATALOG.map((provider) => {
			// Check prefixed name first, then generic, then fallback
			const hasKey = !!(
				import.meta.env[`EMDASH_${provider.envKey}`] || import.meta.env[provider.envKey]
			);

			return {
				id: provider.id,
				name: provider.name,
				models: provider.models.map((m) => ({ id: m.id, name: m.name })),
				configured: hasKey,
			};
		});

		return apiSuccess({ providers });
	} catch (error) {
		return handleError(error, "Failed to list AI providers", "PROVIDER_LIST_ERROR");
	}
};
