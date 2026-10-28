import { sql, type Kysely } from 'kysely';

/** Settings that the simpler model does not use. */
const REMOVED_SETTINGS = ['slope.optional', 'slope.normal', 'slope.important', 'slope.critical', 'earlier_max_need',
    'earlier_window_seconds'];

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
 * Replaces the chore table with the simpler model. The growth usage becomes pauses_when_away, the condition becomes
 * requires_id and the boost becomes trigger_id. The other old chore columns are dropped. A condition gets the
 * forecast template and the time since its result is true. A forecast condition moves its template to the forecast
 * template and gets the template true. The events get a duration with 0 for the existing events. The removed
 * settings are deleted.
 *
 * @param db the database
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await withoutForeignKeys(db, async () => {
        await sql`ALTER TABLE condition ADD COLUMN forecast_template TEXT`.execute(db);
        await sql`ALTER TABLE condition ADD COLUMN since_at INTEGER`.execute(db);
        await sql`UPDATE condition SET forecast_template = template, template = 'true', result = NULL, error = NULL
            WHERE kind = 'forecast'`.execute(db);
        await sql`ALTER TABLE condition DROP COLUMN kind`.execute(db);

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
          last_done_at      INTEGER NOT NULL,
          snoozed_until     INTEGER,
          not_yet_count     INTEGER NOT NULL DEFAULT 0,
          last_notified_at  INTEGER,
          created_at        INTEGER NOT NULL,
          updated_at        INTEGER NOT NULL,
          deleted_at        INTEGER
        )`.execute(db);
        await sql`INSERT INTO chore_new (id, name, kind, interval, pauses_when_away, deadline_md, deadline_at, requires_id,
            trigger_id, duration_min, effort, season_months, noisy, notes, last_done_at, snoozed_until, not_yet_count,
            last_notified_at, created_at, updated_at, deleted_at)
          SELECT id, name, kind, interval, CASE WHEN growth = 'usage' THEN 1 ELSE 0 END, deadline_md, deadline_at,
            condition_id, boost_id, duration_min, effort, season_months, noisy, notes, last_done_at, snoozed_until,
            not_yet_count, last_notified_at, created_at, updated_at, deleted_at
          FROM chore`.execute(db);
        await sql`DROP TABLE chore`.execute(db);
        await sql`ALTER TABLE chore_new RENAME TO chore`.execute(db);
        await sql`CREATE INDEX chore_active ON chore (deleted_at) WHERE deleted_at IS NULL`.execute(db);

        await sql`ALTER TABLE event ADD COLUMN duration_min INTEGER NOT NULL DEFAULT 0`.execute(db);
        await sql`DELETE FROM setting WHERE key IN (${sql.join(REMOVED_SETTINGS)})`.execute(db);
    });
}

/**
 * Restores the old chore columns with default values and the kind of the conditions. A condition with a forecast
 * template becomes a forecast condition, the current template is lost.
 *
 * @param db the database
 */
export async function down(db: Kysely<unknown>): Promise<void> {
    await withoutForeignKeys(db, async () => {
        await sql`CREATE TABLE chore_old (
          id                  INTEGER PRIMARY KEY,
          name                TEXT NOT NULL,
          group_key           TEXT,
          kind                TEXT NOT NULL CHECK (kind IN ('recurring', 'one_time')),
          growth              TEXT NOT NULL CHECK (growth IN ('usage', 'time', 'counter')),
          interval            REAL,
          interval_min        REAL,
          interval_max        REAL,
          learn_step          REAL NOT NULL DEFAULT 0.15,
          learn_direction     INTEGER NOT NULL DEFAULT 0,
          counter_entity      TEXT,
          importance          TEXT NOT NULL CHECK (importance IN ('optional', 'normal', 'important', 'critical')),
          deadline_md         TEXT,
          deadline_at         INTEGER,
          deadline_lead_days  INTEGER NOT NULL DEFAULT 14,
          duration_min        INTEGER NOT NULL,
          effort              INTEGER NOT NULL CHECK (effort BETWEEN 1 AND 5),
          noisy               INTEGER NOT NULL DEFAULT 0,
          notes               TEXT,
          last_done_at        INTEGER NOT NULL,
          snoozed_until       INTEGER,
          not_yet_count       INTEGER NOT NULL DEFAULT 0,
          last_notified_at    INTEGER,
          created_at          INTEGER NOT NULL,
          updated_at          INTEGER NOT NULL,
          deleted_at          INTEGER,
          condition_id        INTEGER REFERENCES condition(id),
          boost_id            INTEGER REFERENCES condition(id),
          forecast_id         INTEGER REFERENCES condition(id),
          season_months       INTEGER NOT NULL DEFAULT 0
        )`.execute(db);
        await sql`INSERT INTO chore_old (id, name, kind, growth, interval, interval_min, interval_max, importance,
            deadline_md, deadline_at, duration_min, effort, noisy, notes, last_done_at, snoozed_until, not_yet_count,
            last_notified_at, created_at, updated_at, deleted_at, condition_id, boost_id, season_months)
          SELECT id, name, kind, CASE WHEN pauses_when_away = 1 THEN 'usage' ELSE 'time' END, interval, interval / 8,
            interval * 4, 'normal', deadline_md, deadline_at, duration_min, effort, noisy, notes, last_done_at,
            snoozed_until, not_yet_count, last_notified_at, created_at, updated_at, deleted_at, requires_id, trigger_id,
            season_months
          FROM chore`.execute(db);
        await sql`DROP TABLE chore`.execute(db);
        await sql`ALTER TABLE chore_old RENAME TO chore`.execute(db);
        await sql`CREATE INDEX chore_active ON chore (deleted_at) WHERE deleted_at IS NULL`.execute(db);

        await sql`ALTER TABLE condition ADD COLUMN kind TEXT NOT NULL DEFAULT 'state'
            CHECK (kind IN ('state', 'forecast'))`.execute(db);
        await sql`UPDATE condition SET kind = 'forecast', template = forecast_template
            WHERE forecast_template IS NOT NULL`.execute(db);
        await sql`ALTER TABLE condition DROP COLUMN forecast_template`.execute(db);
        await sql`ALTER TABLE condition DROP COLUMN since_at`.execute(db);
        await sql`ALTER TABLE event DROP COLUMN duration_min`.execute(db);
    });
}
