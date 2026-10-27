import { sql, type Kysely } from 'kysely';

/** Template columns of the chore table by their alias in the query, with the new column and the kind of condition. */
const COLUMNS = [
    { alias: 'cond', id: 'condition_id', kind: 'state' },
    { alias: 'boost', id: 'boost_id', kind: 'state' },
    { alias: 'forecast', id: 'forecast_id', kind: 'forecast' },
] as const;

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
 * Moves the templates of the chores to the new condition table. Each distinct template of a kind becomes one
 * condition with the name of the first chore that uses it. The cached forecast results are removed.
 *
 * @param db the database
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    await withoutForeignKeys(db, async () => {
        await sql`CREATE TABLE condition (
          id        INTEGER PRIMARY KEY,
          name      TEXT NOT NULL UNIQUE,
          kind      TEXT NOT NULL CHECK (kind IN ('state', 'forecast')),
          template  TEXT NOT NULL,
          result    INTEGER,
          error     TEXT
        )`.execute(db);
        for (const c of COLUMNS) {
            await sql.raw(`ALTER TABLE chore ADD COLUMN ${c.id} INTEGER REFERENCES condition(id)`).execute(db);
        }

        // the aliases have no underscore, so the result keys are the same with the camel case plugin
        const chores = await sql<Record<string, string | number | null>>`SELECT id, name, condition_template AS cond,
            boost_template AS boost, forecast_template AS forecast FROM chore ORDER BY id`.execute(db);
        const ids = new Map<string, number>();
        const names = new Set<string>();
        for (const chore of chores.rows) {
            for (const c of COLUMNS) {
                const template = chore[c.alias] as string | null;
                if (template === null) continue;
                const key = `${c.kind}\u0000${template}`;
                let id = ids.get(key);
                if (id === undefined) {
                    let name = String(chore.name);
                    for (let n = 2; names.has(name); n++) name = `${chore.name} (${n})`;
                    names.add(name);
                    const inserted = await sql<{ id: number }>`INSERT INTO condition (name, kind, template)
                        VALUES (${name}, ${c.kind}, ${template}) RETURNING id`.execute(db);
                    id = inserted.rows[0]!.id;
                    ids.set(key, id);
                }
                await sql`UPDATE chore SET ${sql.ref(c.id)} = ${id} WHERE id = ${chore.id}`.execute(db);
            }
        }

        for (const column of ['condition_template', 'boost_template', 'forecast_template', 'condition_result',
            'boost_result', 'template_error']) {
            await sql.raw(`ALTER TABLE chore DROP COLUMN ${column}`).execute(db);
        }
        // the cached forecast results use the chore id as the key
        await sql`DELETE FROM cache WHERE key LIKE 'forecast_template:%'`.execute(db);
    });
}

/**
 * Copies the templates of the conditions back to the chores and drops the condition table.
 *
 * @param db the database
 */
export async function down(db: Kysely<unknown>): Promise<void> {
    await withoutForeignKeys(db, async () => {
        await sql`CREATE TABLE chore_new (
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
          condition_template  TEXT,
          boost_template      TEXT,
          forecast_template   TEXT,
          condition_result    INTEGER,
          boost_result        INTEGER,
          template_error      TEXT,
          duration_min        INTEGER NOT NULL,
          effort              INTEGER NOT NULL CHECK (effort BETWEEN 1 AND 5),
          assignment          TEXT NOT NULL CHECK (assignment IN ('any', 'all')),
          season_from         INTEGER CHECK (season_from BETWEEN 1 AND 12),
          season_to           INTEGER CHECK (season_to BETWEEN 1 AND 12),
          noisy               INTEGER NOT NULL DEFAULT 0,
          notes               TEXT,
          last_done_at        INTEGER NOT NULL,
          snoozed_until       INTEGER,
          not_yet_count       INTEGER NOT NULL DEFAULT 0,
          last_notified_at    INTEGER,
          created_at          INTEGER NOT NULL,
          updated_at          INTEGER NOT NULL,
          deleted_at          INTEGER
        )`.execute(db);
        await sql`INSERT INTO chore_new
          SELECT c.id, c.name, c.group_key, c.kind, c.growth, c.interval, c.interval_min, c.interval_max, c.learn_step,
            c.learn_direction, c.counter_entity, c.importance, c.deadline_md, c.deadline_at, c.deadline_lead_days,
            cc.template, bc.template, fc.template, cc.result, bc.result, COALESCE(cc.error, bc.error), c.duration_min,
            c.effort, c.assignment, c.season_from, c.season_to, c.noisy, c.notes, c.last_done_at, c.snoozed_until,
            c.not_yet_count, c.last_notified_at, c.created_at, c.updated_at, c.deleted_at
          FROM chore c
          LEFT JOIN condition cc ON cc.id = c.condition_id
          LEFT JOIN condition bc ON bc.id = c.boost_id
          LEFT JOIN condition fc ON fc.id = c.forecast_id`.execute(db);
        await sql`DROP TABLE chore`.execute(db);
        await sql`ALTER TABLE chore_new RENAME TO chore`.execute(db);
        await sql`CREATE INDEX chore_active ON chore (deleted_at) WHERE deleted_at IS NULL`.execute(db);
        await sql`DROP TABLE condition`.execute(db);
    });
}
