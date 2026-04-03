/**
 * Migration 033: Agent Runs
 *
 * Creates the _emdash_agent_runs table for tracking AI agent executions.
 * Also adds agent metadata columns to existing content tables (via
 * _emdash_collections discovery).
 */

import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
	// ── Agent runs table ──
	await db.schema
		.createTable("_emdash_agent_runs")
		.addColumn("id", "text", (col) => col.primaryKey())
		.addColumn("agent_id", "text", (col) => col.notNull())
		.addColumn("status", "text", (col) => col.notNull().defaultTo("running"))
		.addColumn("started_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
		.addColumn("completed_at", "text")
		.addColumn("error_message", "text")
		.addColumn("content_ids", "text") // JSON array of content IDs affected
		.addColumn("tokens_used", "integer")
		.addColumn("model_used", "text")
		.addColumn("trigger", "text", (col) => col.notNull().defaultTo("cron"))
		.execute();

	// Indexes for agent runs
	await db.schema
		.createIndex("idx_agent_runs_agent_id")
		.on("_emdash_agent_runs")
		.column("agent_id")
		.execute();

	await db.schema
		.createIndex("idx_agent_runs_status")
		.on("_emdash_agent_runs")
		.column("status")
		.execute();

	await db.schema
		.createIndex("idx_agent_runs_started_at")
		.on("_emdash_agent_runs")
		.column("started_at")
		.execute();

	// ── Add agent columns to all content tables ──
	// Discover existing ec_* tables from _emdash_collections
	const collections = await sql<{ table_name: string }>`
		SELECT ${sql.lit("ec_")} || slug AS table_name
		FROM _emdash_collections
	`.execute(db);

	for (const row of collections.rows) {
		const table = row.table_name;
		// Add agent_id column (null for human-authored content)
		await sql`ALTER TABLE ${sql.ref(table)} ADD COLUMN agent_id TEXT`.execute(db);
		// Add agent_run_id column (links to specific run)
		await sql`ALTER TABLE ${sql.ref(table)} ADD COLUMN agent_run_id TEXT`.execute(db);
	}
}

export async function down(db: Kysely<unknown>): Promise<void> {
	// Remove agent columns from content tables
	const collections = await sql<{ table_name: string }>`
		SELECT ${sql.lit("ec_")} || slug AS table_name
		FROM _emdash_collections
	`.execute(db);

	for (const row of collections.rows) {
		const table = row.table_name;
		await sql`ALTER TABLE ${sql.ref(table)} DROP COLUMN agent_id`.execute(db);
		await sql`ALTER TABLE ${sql.ref(table)} DROP COLUMN agent_run_id`.execute(db);
	}

	await db.schema.dropTable("_emdash_agent_runs").execute();
}
