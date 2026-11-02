import { sql, type Kysely } from 'kysely';

/**
 * Renames the setting trigger_min_need to urgent_min_need, because it applies to deadlines too.
 *
 * @param db the database
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`UPDATE setting SET key = 'urgent_min_need' WHERE key = 'trigger_min_need'`.execute(db);
}

/**
 * Renames the setting urgent_min_need back to trigger_min_need.
 *
 * @param db the database
 */
export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`UPDATE setting SET key = 'trigger_min_need' WHERE key = 'urgent_min_need'`.execute(db);
}
