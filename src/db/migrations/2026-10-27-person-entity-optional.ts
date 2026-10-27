import { sql, type Kysely } from 'kysely';

/**
 * Runs statements with the foreign keys switched off. A table rebuild with foreign keys on deletes the rows that
 * reference the old table.
 *
 * @param db the database
 * @param statements the statements, run in one transaction
 */
async function rebuild(db: Kysely<unknown>, statements: string[]): Promise<void> {
    await sql`PRAGMA foreign_keys = OFF`.execute(db);
    try {
        await sql`BEGIN`.execute(db);
        for (const statement of statements) await sql.raw(statement).execute(db);
        await sql`COMMIT`.execute(db);
    } catch (err) {
        await sql`ROLLBACK`.execute(db);
        throw err;
    } finally {
        await sql`PRAGMA foreign_keys = ON`.execute(db);
    }
}

/**
 * Builds the statements that recreate the person table with the given definition of ha_entity.
 *
 * @param haEntity the column definition
 */
function personTable(haEntity: string): string[] {
    return [
        `CREATE TABLE person_new (
          id                  INTEGER PRIMARY KEY,
          name                TEXT NOT NULL UNIQUE,
          ha_entity           ${haEntity},
          ha_distance_entity  TEXT,
          ha_calendar_entity  TEXT,
          ha_notify_action    TEXT,
          password_hash       TEXT,
          sort                INTEGER NOT NULL DEFAULT 0
        )`,
        `INSERT INTO person_new SELECT id, name, ha_entity, ha_distance_entity, ha_calendar_entity, ha_notify_action,
          password_hash, sort FROM person`,
        'DROP TABLE person',
        'ALTER TABLE person_new RENAME TO person',
    ];
}

/**
 * Makes the person entity optional.
 *
 * @param db the database
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await rebuild(db, personTable('TEXT'));
}

/**
 * Makes the person entity required again. Persons without an entity get an empty entity.
 *
 * @param db the database
 */
export async function down(db: Kysely<unknown>): Promise<void> {
    await rebuild(db, ["UPDATE person SET ha_entity = '' WHERE ha_entity IS NULL", ...personTable('TEXT NOT NULL')]);
}
