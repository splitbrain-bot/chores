import { sql, type Kysely } from 'kysely';

/**
 * Returns a random color with a medium saturation and lightness as #rrggbb.
 */
function randomColor(): string {
    const h = Math.random() * 360;
    const s = 0.65;
    const l = 0.5;
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const v = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(v * 255).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Adds an icon to the categories and the conditions, and a color to the persons. Each existing person gets a
 * random color.
 *
 * @param db the database
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE category ADD COLUMN icon TEXT`.execute(db);
    await sql`ALTER TABLE condition ADD COLUMN icon TEXT`.execute(db);
    await sql`ALTER TABLE person ADD COLUMN color TEXT NOT NULL DEFAULT '#808080'`.execute(db);
    const persons = await sql<{ id: number }>`SELECT id FROM person`.execute(db);
    for (const { id } of persons.rows) {
        await sql`UPDATE person SET color = ${randomColor()} WHERE id = ${id}`.execute(db);
    }
}

/**
 * Removes the icons and the colors.
 *
 * @param db the database
 */
export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`ALTER TABLE category DROP COLUMN icon`.execute(db);
    await sql`ALTER TABLE condition DROP COLUMN icon`.execute(db);
    await sql`ALTER TABLE person DROP COLUMN color`.execute(db);
}
