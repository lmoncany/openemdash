# OpenEmDash

A self-hostable, AI-native fork of [EmDash](https://github.com/emdash-cms/emdash). Full-stack TypeScript CMS built on [Astro](https://astro.build/), with AI agents that work while you sleep.

## Why OpenEmDash?

EmDash is a genuinely good CMS. Astro-native, TypeScript, schema-in-database, sandboxed plugins. But it has a contradiction: it calls itself open source while requiring Cloudflare infrastructure. Dynamic Workers for plugin sandboxing, R2 for storage, D1 for the database. You can't run the full feature set without a Cloudflare paid account. That's not the WordPress spirit of "install it anywhere."

OpenEmDash fixes this. Two changes:

1. **Host anywhere.** Docker, any VPS, any cloud. SQLite or Postgres. Local filesystem or S3-compatible storage (Minio, AWS, Backblaze). Zero Cloudflare dependency.

2. **AI-native from day one.** A built-in AI copilot sidebar with BYOK (bring your own key) support. Named AI agents that run on schedules as CMS plugins. Toto writes blog posts at 2 AM. BUBU reviews your SEO at dawn. You wake up to drafted content. These aren't features bolted on. They're teammates.

## Quick Start

```bash
docker compose up --build
```

Open [http://localhost:4321/\_emdash/setup](http://localhost:4321/_emdash/setup) to initialize your site.

That's it. No Cloudflare account, no AWS credentials, no external services. SQLite database and local file storage, ready to go.

## AI Agents

OpenEmDash ships with AI agent plugins that use EmDash's existing plugin system (hooks, cron, settings, admin pages). Agents are plugins. The community can build more.

### Toto — Content Writer

Writes blog posts on a schedule. Configure a topic, set a cron schedule, and Toto generates drafts overnight. All content starts as `ai_draft` — you review before publishing.

### BUBU — SEO Analyzer

Reviews your content for SEO. Checks titles, meta descriptions, keyword density, readability scores. Runs after every publish or on a schedule.

### Bring Your Own Key

No AI vendor lock-in. Configure any provider:

- **Anthropic** (Claude)
- **OpenAI** (GPT-4, etc.)
- **Ollama** (local models, fully private)
- **Google** (Gemini)

API keys are encrypted at rest (AES-256-GCM). Keys never appear in API responses or logs.

## Features

Everything EmDash has, plus host-anywhere and AI:

- **Content** — Blog posts, pages, custom types. Rich text (TipTap + Portable Text). Revisions, drafts, scheduled publishing, full-text search, visual editing.
- **Admin** — Visual schema builder, media library, navigation menus, taxonomies, widgets, WordPress import.
- **Auth** — Passkey-first (WebAuthn) with OAuth and magic link fallbacks. Role-based access: Admin, Editor, Author, Contributor.
- **Plugins** — `definePlugin()` API with hooks, storage, settings, admin pages, cron, and API routes.
- **AI Copilot** — Chat sidebar in admin. Talk to your agents, trigger runs manually, see activity.
- **Self-hosted** — Docker Compose with SQLite + local storage. Postgres and S3 for production scale.

## Portable Platforms

| Layer    | Default (self-hosted) | Also works with                         |
| -------- | --------------------- | --------------------------------------- |
| Database | SQLite                | Postgres, Turso/libSQL, Cloudflare D1   |
| Storage  | Local filesystem      | S3, Minio, R2, Backblaze B2             |
| Plugins  | In-process (trusted)  | isolated-vm sandbox, Cloudflare Workers |
| AI       | BYOK (any provider)   | Ollama (fully local/private)            |

## Development

This is a pnpm monorepo.

```bash
git clone https://github.com/your-org/openemdash.git && cd openemdash
pnpm install
pnpm build
```

Run the demo (Node.js + SQLite, no external services):

```bash
pnpm --filter emdash-demo seed
pnpm --filter emdash-demo dev
```

Open the admin at [http://localhost:4321/\_emdash/admin](http://localhost:4321/_emdash/admin).

```bash
pnpm test          # run all tests
pnpm typecheck     # type check
pnpm lint:quick    # fast lint (< 1s)
pnpm format        # format with oxfmt
```

## Repository Structure

```
packages/
  core/           Astro integration, APIs, admin, AI provider layer
  admin/          Admin UI (React)
  auth/           Authentication library
  blocks/         Portable Text block definitions
  cloudflare/     Cloudflare adapter (optional, for CF deployments)
  plugins/        First-party plugins
    ai-writer/    Toto — AI content writer agent
    seo-analyzer/ BUBU — SEO analysis agent
    audit-log/    Audit trail
    forms/        Form submissions
    ...

templates/        Starter templates (blog, marketing, portfolio)
demos/            Development and example sites
docs/             Documentation site (Starlight)
```

## Relationship to EmDash

OpenEmDash is a fork of [EmDash](https://github.com/emdash-cms/emdash) by Cloudflare. We maintain a patch series on top of upstream, periodically rebasing on tagged releases. Platform abstraction improvements are contributed back upstream where possible. The AI agent system and Docker packaging are permanent divergence points.

EmDash is MIT licensed. OpenEmDash is MIT licensed.

## Status

**Alpha.** Docker self-hosting works. AI agent plugins are in development. We welcome contributions, feedback, and ideas.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contributor guide.
