import { sql, type Kysely } from 'kysely';

const statements = [
    `CREATE TABLE person (
      id                  INTEGER PRIMARY KEY,
      name                TEXT NOT NULL UNIQUE,
      ha_entity           TEXT NOT NULL,
      ha_distance_entity  TEXT,
      ha_calendar_entity  TEXT,
      ha_notify_action    TEXT,
      password_hash       TEXT,
      sort                INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE category (
      id    INTEGER PRIMARY KEY,
      name  TEXT NOT NULL UNIQUE,
      sort  INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE chore (
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
    )`,
    `CREATE INDEX chore_active ON chore (deleted_at) WHERE deleted_at IS NULL`,
    `CREATE TABLE chore_category (
      chore_id     INTEGER NOT NULL REFERENCES chore(id) ON DELETE CASCADE,
      category_id  INTEGER NOT NULL REFERENCES category(id) ON DELETE CASCADE,
      PRIMARY KEY (chore_id, category_id)
    )`,
    `CREATE TABLE chore_person (
      chore_id   INTEGER NOT NULL REFERENCES chore(id) ON DELETE CASCADE,
      person_id  INTEGER NOT NULL REFERENCES person(id) ON DELETE CASCADE,
      PRIMARY KEY (chore_id, person_id)
    )`,
    `CREATE TABLE event (
      id               INTEGER PRIMARY KEY,
      chore_id         INTEGER NOT NULL REFERENCES chore(id),
      type             TEXT NOT NULL CHECK (type IN ('done', 'earlier', 'postpone')),
      reason           TEXT CHECK (reason IN ('no_time', 'no_energy', 'not_yet')),
      at               INTEGER NOT NULL,
      person_id        INTEGER REFERENCES person(id),
      need_level       REAL NOT NULL,
      interval_before  REAL,
      interval_after   REAL,
      effort           INTEGER NOT NULL
    )`,
    `CREATE INDEX event_chore_at ON event (chore_id, at)`,
    `CREATE INDEX event_at ON event (at)`,
    `CREATE TABLE ha_state (
      id         INTEGER PRIMARY KEY,
      entity_id  TEXT NOT NULL,
      state      TEXT NOT NULL,
      at         INTEGER NOT NULL
    )`,
    `CREATE INDEX ha_state_entity_at ON ha_state (entity_id, at)`,
    `CREATE TABLE occupancy (
      id           INTEGER PRIMARY KEY,
      start_at     INTEGER NOT NULL,
      end_at       INTEGER,
      clock_start  INTEGER NOT NULL
    )`,
    `CREATE INDEX occupancy_start ON occupancy (start_at)`,
    `CREATE TABLE token (
      id            INTEGER PRIMARY KEY,
      kind          TEXT NOT NULL CHECK (kind IN ('person', 'shared', 'mcp')),
      person_id     INTEGER REFERENCES person(id) ON DELETE CASCADE,
      label         TEXT NOT NULL,
      token_hash    TEXT NOT NULL UNIQUE,
      created_at    INTEGER NOT NULL,
      last_used_at  INTEGER,
      revoked_at    INTEGER
    )`,
    `CREATE TABLE setting (
      key    TEXT PRIMARY KEY,
      value  TEXT NOT NULL
    )`,
    `CREATE TABLE cache (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      fetched_at  INTEGER NOT NULL
    )`,
];

/**
 * Creates all tables.
 *
 * @param db the database
 */
export async function up(db: Kysely<unknown>): Promise<void> {
    for (const statement of statements) await sql.raw(statement).execute(db);
}

/**
 * Drops all tables.
 *
 * @param db the database
 */
export async function down(db: Kysely<unknown>): Promise<void> {
    for (const table of ['cache', 'setting', 'token', 'occupancy', 'ha_state', 'event', 'chore_person', 'chore_category',
        'chore', 'category', 'person']) {
        await sql.raw(`DROP TABLE ${table}`).execute(db);
    }
}
