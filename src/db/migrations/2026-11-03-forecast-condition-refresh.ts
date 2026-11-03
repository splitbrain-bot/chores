import { sql, type Kysely } from 'kysely';

/**
 * Renames the setting forecast_refresh_minutes to forecast_condition_refresh_minutes.
 *
 * @param db the database
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`UPDATE setting SET key = 'forecast_condition_refresh_minutes' WHERE key = 'forecast_refresh_minutes'`
        .execute(db);
}

/**
 * Renames the setting forecast_condition_refresh_minutes back to forecast_refresh_minutes.
 *
 * @param db the database
 */
export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`UPDATE setting SET key = 'forecast_refresh_minutes' WHERE key = 'forecast_condition_refresh_minutes'`
        .execute(db);
}
