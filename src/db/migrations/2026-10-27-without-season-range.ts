import { sql, type Kysely } from 'kysely';

/**
 * Replaces the first and the last month of the season with one bit per month, bit 0 is January. 0 means the whole
 * year. A season across the new year gets the months of both years.
 *
 * @param db the database
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE chore ADD COLUMN season_months INTEGER NOT NULL DEFAULT 0`.execute(db);
    const rows = await sql<{ id: number; from: number; to: number }>`SELECT id, season_from AS "from", season_to AS "to"
        FROM chore WHERE season_from IS NOT NULL AND season_to IS NOT NULL`.execute(db);
    for (const { id, from, to } of rows.rows) {
        let bits = 0;
        for (let m = 1; m <= 12; m++) {
            if (from <= to ? m >= from && m <= to : m >= from || m <= to) bits |= 1 << (m - 1);
        }
        await sql`UPDATE chore SET season_months = ${bits} WHERE id = ${id}`.execute(db);
    }
    await sql`ALTER TABLE chore DROP COLUMN season_from`.execute(db);
    await sql`ALTER TABLE chore DROP COLUMN season_to`.execute(db);
}

/**
 * Converts the months back to a first and a last month. A season with gaps keeps only its first range of
 * consecutive months.
 *
 * @param db the database
 */
export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE chore ADD COLUMN season_from INTEGER CHECK (season_from BETWEEN 1 AND 12)`.execute(db);
    await sql`ALTER TABLE chore ADD COLUMN season_to INTEGER CHECK (season_to BETWEEN 1 AND 12)`.execute(db);
    const rows = await sql<{ id: number; bits: number }>`SELECT id, season_months AS bits FROM chore
        WHERE season_months != 0`.execute(db);
    for (const { id, bits } of rows.rows) {
        const on = (m: number) => (bits & (1 << ((m + 11) % 12))) !== 0;
        // the first range starts at the first month whose month before is not in the season
        const from = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((m) => on(m) && !on(m - 1)) ?? 1;
        let to = from;
        while (on(to % 12 + 1) && to % 12 + 1 !== from) to = to % 12 + 1;
        await sql`UPDATE chore SET season_from = ${from}, season_to = ${to} WHERE id = ${id}`.execute(db);
    }
    await sql`ALTER TABLE chore DROP COLUMN season_months`.execute(db);
}
