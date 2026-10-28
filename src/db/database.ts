import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import SQLite from 'better-sqlite3';
import { CamelCasePlugin, Kysely, SqliteDialect } from 'kysely';
import { Migrator, type Migration } from 'kysely/migration';
import * as initial from './migrations/2026-10-27-initial.ts';
import * as personEntityOptional from './migrations/2026-10-27-person-entity-optional.ts';
import * as slotWeekdays from './migrations/2026-10-27-slot-weekdays.ts';
import * as templatesToConditions from './migrations/2026-10-27-templates-to-conditions.ts';
import * as visualIconsAndColors from './migrations/2026-10-27-visual-icons-and-colors.ts';
import * as withoutAssignment from './migrations/2026-10-27-without-assignment.ts';
import * as withoutSeasonRange from './migrations/2026-10-27-without-season-range.ts';
import * as simplerChores from './migrations/2026-10-28-simpler-chores.ts';
import type { DB } from './types.ts';

/** The database handle of the application. */
export type Database = Kysely<DB>;

/** All migrations by name. The names sort in the order of execution. */
const migrations: Record<string, Migration> = {
    '2026-10-27-initial': initial,
    '2026-10-27-person-entity-optional': personEntityOptional,
    '2026-10-27-slot-weekdays': slotWeekdays,
    '2026-10-27-templates-to-conditions': templatesToConditions,
    '2026-10-27-visual-icons-and-colors': visualIconsAndColors,
    '2026-10-27-without-assignment': withoutAssignment,
    '2026-10-27-without-season-range': withoutSeasonRange,
    '2026-10-28-simpler-chores': simplerChores,
};

/**
 * Opens the SQLite database and sets the pragmas.
 *
 * @param path file path, or :memory: for a database in memory
 */
export function openDatabase(path: string): Database {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    const sqlite = new SQLite(path);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('busy_timeout = 5000');
    return new Kysely<DB>({ dialect: new SqliteDialect({ database: sqlite }), plugins: [new CamelCasePlugin()] });
}

/**
 * Runs all pending migrations.
 *
 * @param db the database
 * @throws Error when a migration fails
 */
export async function migrate(db: Database): Promise<void> {
    const migrator = new Migrator({ db, provider: { getMigrations: async () => migrations } });
    const { error, results } = await migrator.migrateToLatest();
    for (const r of results ?? []) {
        if (r.status === 'Error') console.error(`Migration ${r.migrationName} failed`);
    }
    if (error) throw error instanceof Error ? error : new Error(String(error));
}

/**
 * Opens the database and runs the migrations.
 *
 * @param path file path, or :memory: for a database in memory
 */
export async function createDatabase(path: string): Promise<Database> {
    const db = openDatabase(path);
    await migrate(db);
    return db;
}
