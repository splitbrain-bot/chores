import { sql, type Kysely } from 'kysely';

/**
 * Runs a function in a transaction with the foreign keys switched off. A table rebuild with foreign keys on deletes
 * the rows that reference the old table.
 *
 * @param db the database
 * @param run the function
 */
async function withoutForeignKeys(db: Kysely<unknown>, run: () => Promise<void>): Promise<void> {
    await sql`PRAGMA foreign_keys = OFF`.execute(db);
    try {
        await sql`BEGIN`.execute(db);
        await run();
        await sql`COMMIT`.execute(db);
    } catch (err) {
        await sql`ROLLBACK`.execute(db);
        throw err;
    } finally {
        await sql`PRAGMA foreign_keys = ON`.execute(db);
    }
}

/**
 * Recreates the chore table with the given definition of last_done_at.
 *
 * @param db the database
 * @param lastDoneAt the column definition
 */
async function rebuildChore(db: Kysely<unknown>, lastDoneAt: string): Promise<void> {
    await sql`CREATE TABLE chore_new (
      id                INTEGER PRIMARY KEY,
      name              TEXT NOT NULL,
      kind              TEXT NOT NULL CHECK (kind IN ('recurring', 'one_time')),
      interval          REAL,
      pauses_when_away  INTEGER NOT NULL DEFAULT 1,
      deadline_md       TEXT,
      deadline_at       INTEGER,
      requires_id       INTEGER REFERENCES condition(id),
      trigger_id        INTEGER REFERENCES condition(id),
      duration_min      INTEGER NOT NULL,
      effort            INTEGER NOT NULL CHECK (effort BETWEEN 1 AND 5),
      season_months     INTEGER NOT NULL DEFAULT 0,
      noisy             INTEGER NOT NULL DEFAULT 0,
      notes             TEXT,
      last_done_at      ${sql.raw(lastDoneAt)},
      snoozed_until     INTEGER,
      not_yet_count     INTEGER NOT NULL DEFAULT 0,
      last_notified_at  INTEGER,
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL,
      deleted_at        INTEGER
    )`.execute(db);
    await sql`INSERT INTO chore_new SELECT id, name, kind, interval, pauses_when_away, deadline_md, deadline_at,
        requires_id, trigger_id, duration_min, effort, season_months, noisy, notes, last_done_at, snoozed_until,
        not_yet_count, last_notified_at, created_at, updated_at, deleted_at
      FROM chore`.execute(db);
    await sql`DROP TABLE chore`.execute(db);
    await sql`ALTER TABLE chore_new RENAME TO chore`.execute(db);
    await sql`CREATE INDEX chore_active ON chore (deleted_at) WHERE deleted_at IS NULL`.execute(db);
}

/**
 * Makes the last done time optional. Null means that the start is unknown. One-time tasks and recurring chores that
 * were created without a time and never done get null. Existing events get start_known 1.
 *
 * @param db the database
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await withoutForeignKeys(db, async () => {
        await rebuildChore(db, 'INTEGER');
        await sql`UPDATE chore SET last_done_at = NULL
            WHERE kind = 'one_time' OR last_done_at = created_at`.execute(db);
        await sql`ALTER TABLE event ADD COLUMN start_known INTEGER NOT NULL DEFAULT 1`.execute(db);
    });
}

/**
 * Makes the last done time required again. An unknown start becomes the creation time.
 *
 * @param db the database
 */
export async function down(db: Kysely<unknown>): Promise<void> {
    await withoutForeignKeys(db, async () => {
        await sql`UPDATE chore SET last_done_at = created_at WHERE last_done_at IS NULL`.execute(db);
        await rebuildChore(db, 'INTEGER NOT NULL');
        await sql`ALTER TABLE event DROP COLUMN start_known`.execute(db);
    });
}
