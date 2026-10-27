import { sql, type Kysely } from 'kysely';

/** Weekdays of the former day types, 0 is Sunday. */
const DAYS: Record<string, number[]> = { workday: [1, 2, 3, 4], weekend: [5, 6, 0] };

/**
 * Replaces the stored slot table with the result of a conversion of each slot.
 *
 * @param db the database
 * @param convert converts one stored slot
 */
async function convertSlots(db: Kysely<unknown>, convert: (slot: Record<string, unknown>) => Record<string, unknown>):
    Promise<void> {
    const rows = await sql<{ value: string }>`SELECT value FROM setting WHERE key = 'capacity_slots'`.execute(db);
    const row = rows.rows[0];
    if (!row) return;
    const slots = (JSON.parse(row.value) as Record<string, unknown>[]).map(convert);
    await sql`UPDATE setting SET value = ${JSON.stringify(slots)} WHERE key = 'capacity_slots'`.execute(db);
}

/**
 * Converts the day type of the stored capacity slots to a list of weekdays.
 *
 * @param db the database
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await convertSlots(db, ({ dayType, ...slot }) => ({ days: DAYS[String(dayType)] ?? DAYS.weekend, ...slot }));
}

/**
 * Converts the weekdays of the stored capacity slots to a day type. A slot that includes a day from Monday to
 * Thursday becomes a workday slot.
 *
 * @param db the database
 */
export async function down(db: Kysely<unknown>): Promise<void> {
    await convertSlots(db, ({ days, ...slot }) => ({
        dayType: (days as number[]).some((d) => d >= 1 && d <= 4) ? 'workday' : 'weekend', ...slot,
    }));
}
