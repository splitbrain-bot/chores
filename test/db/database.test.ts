import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../src/db/database.ts';

describe('database', () => {
    it('runs the migrations on an empty file and again without changes', async () => {
        const path = join(mkdtempSync(join(tmpdir(), 'chores-')), 'sub', 'test.sqlite');
        const db = await createDatabase(path);
        await db.destroy();
        const again = await createDatabase(path);
        const tables = await again.introspection.getTables();
        expect(tables.map((t) => t.name).sort()).toEqual(['cache', 'category', 'chore', 'chore_category', 'chore_person',
            'condition', 'event', 'ha_state', 'occupancy', 'person', 'setting', 'token']);
        await again.destroy();
    });
});

describe('migration person-entity-optional', () => {
    it('keeps the persons and the rows that reference them', async () => {
        const { openDatabase, migrate } = await import('../../src/db/database.ts');
        const { Migrator } = await import('kysely/migration');
        const initial = await import('../../src/db/migrations/2026-10-27-initial.ts');
        const db = openDatabase(':memory:');
        await new Migrator({ db, provider: { getMigrations: async () => ({ '2026-10-27-initial': initial }) } }).migrateToLatest();
        await db.insertInto('person').values({ name: 'Andi', haEntity: 'person.a' }).execute();
        await db.insertInto('token').values({ kind: 'person', personId: 1, label: 'x', tokenHash: 'h', createdAt: 1 }).execute();

        await migrate(db);
        expect(await db.selectFrom('person').select(['id', 'name', 'haEntity']).execute())
            .toEqual([{ id: 1, name: 'Andi', haEntity: 'person.a' }]);
        expect(await db.selectFrom('token').select('personId').execute()).toEqual([{ personId: 1 }]);
        await db.insertInto('person').values({ name: 'Kaddi', haEntity: null }).execute();
        await expect(db.insertInto('token').values({ kind: 'person', personId: 9, label: 'y', tokenHash: 'h2', createdAt: 1 })
            .execute()).rejects.toThrow(/FOREIGN KEY/);
        await db.destroy();
    });
});

describe('migration slot-weekdays', () => {
    it('converts the day types of the stored slots to weekdays', async () => {
        const { openDatabase, migrate } = await import('../../src/db/database.ts');
        const { Migrator } = await import('kysely/migration');
        const initial = await import('../../src/db/migrations/2026-10-27-initial.ts');
        const db = openDatabase(':memory:');
        await new Migrator({ db, provider: { getMigrations: async () => ({ '2026-10-27-initial': initial }) } }).migrateToLatest();
        const slots = [
            { dayType: 'workday', from: '17:00', to: '21:00', minutes: 30, energy: 3 },
            { dayType: 'weekend', from: '08:00', to: '12:00', minutes: 90, energy: 5 },
        ];
        await db.insertInto('setting').values({ key: 'capacity_slots', value: JSON.stringify(slots) }).execute();

        await migrate(db);
        const row = await db.selectFrom('setting').select('value').where('key', '=', 'capacity_slots').executeTakeFirstOrThrow();
        expect(JSON.parse(row.value)).toEqual([
            { days: [1, 2, 3, 4], from: '17:00', to: '21:00', minutes: 30, energy: 3 },
            { days: [5, 6, 0], from: '08:00', to: '12:00', minutes: 90, energy: 5 },
        ]);
        await db.destroy();
    });
});

describe('migration templates-to-conditions', () => {
    it('moves the templates of the chores to shared conditions and back', async () => {
        const { openDatabase } = await import('../../src/db/database.ts');
        const { Migrator } = await import('kysely/migration');
        const { sql } = await import('kysely');
        const initial = await import('../../src/db/migrations/2026-10-27-initial.ts');
        const conditions = await import('../../src/db/migrations/2026-10-27-templates-to-conditions.ts');
        const db = openDatabase(':memory:');
        await new Migrator({ db, provider: { getMigrations: async () => ({ '2026-10-27-initial': initial }) } }).migrateToLatest();
        const chore = (name: string, condition: string | null, boost: string | null, forecast: string | null) =>
            sql`INSERT INTO chore (name, kind, growth, importance, duration_min, effort, assignment, last_done_at,
                created_at, updated_at, condition_template, boost_template, forecast_template)
                VALUES (${name}, 'recurring', 'time', 'normal', 10, 1, 'any', 0, 0, 0, ${condition}, ${boost}, ${forecast})`
                .execute(db);
        await chore('Rasen', '{{ dry }}', '{{ guests }}', '{{ day.sun }}');
        await chore('Hecke', '{{ dry }}', null, null);
        await chore('Rasen', null, '{{ dry }}', null);
        await db.insertInto('category').values({ name: 'Garten' }).execute();
        await db.insertInto('choreCategory').values({ choreId: 2, categoryId: 1 }).execute();
        await db.insertInto('cache').values({ key: 'forecast_template:1:2026-10-30', value: 'true', fetchedAt: 0 }).execute();

        await conditions.up(db as never);
        const created = await sql<Record<string, unknown>>`SELECT id, name, kind, template FROM condition ORDER BY id`
            .execute(db);
        expect(created.rows).toEqual([
            { id: 1, name: 'Rasen', kind: 'state', template: '{{ dry }}' },
            { id: 2, name: 'Rasen (2)', kind: 'state', template: '{{ guests }}' },
            { id: 3, name: 'Rasen (3)', kind: 'forecast', template: '{{ day.sun }}' },
        ]);
        const linked = await sql<Record<string, unknown>>`SELECT condition_id, boost_id, forecast_id FROM chore ORDER BY id`
            .execute(db);
        expect(linked.rows).toEqual([
            { conditionId: 1, boostId: 2, forecastId: 3 },
            { conditionId: 1, boostId: null, forecastId: null },
            { conditionId: null, boostId: 1, forecastId: null },
        ]);
        expect(await db.selectFrom('cache').selectAll().execute()).toEqual([]);

        await conditions.down(db as never);
        const rows = await sql<Record<string, unknown>>`SELECT condition_template, boost_template, forecast_template
            FROM chore ORDER BY id`.execute(db);
        expect(rows.rows).toEqual([
            { conditionTemplate: '{{ dry }}', boostTemplate: '{{ guests }}', forecastTemplate: '{{ day.sun }}' },
            { conditionTemplate: '{{ dry }}', boostTemplate: null, forecastTemplate: null },
            { conditionTemplate: null, boostTemplate: '{{ dry }}', forecastTemplate: null },
        ]);
        expect((await db.introspection.getTables()).map((t) => t.name)).not.toContain('condition');
        expect(await db.selectFrom('choreCategory').selectAll().execute()).toEqual([{ choreId: 2, categoryId: 1 }]);
        await db.destroy();
    });
});

describe('migration visual-icons-and-colors', () => {
    it('gives each existing person a random color and adds the icons', async () => {
        const { openDatabase, migrate } = await import('../../src/db/database.ts');
        const { Migrator } = await import('kysely/migration');
        const initial = await import('../../src/db/migrations/2026-10-27-initial.ts');
        const visual = await import('../../src/db/migrations/2026-10-27-visual-icons-and-colors.ts');
        const db = openDatabase(':memory:');
        await new Migrator({ db, provider: { getMigrations: async () => ({ '2026-10-27-initial': initial }) } }).migrateToLatest();
        await db.insertInto('person').values({ name: 'Andi', haEntity: 'person.a' }).execute();
        await db.insertInto('category').values({ name: 'Küche' }).execute();

        await migrate(db);
        const person = await db.selectFrom('person').select('color').executeTakeFirstOrThrow();
        expect(person.color).toMatch(/^#[0-9a-f]{6}$/);
        expect(await db.selectFrom('category').select('icon').execute()).toEqual([{ icon: null }]);

        await visual.down(db as never);
        expect((await db.introspection.getTables()).find((t) => t.name === 'person')?.columns.map((c) => c.name))
            .not.toContain('color');
        await db.destroy();
    });
});

describe('migration without-assignment', () => {
    it('converts the assignment to the persons of the chores and back', async () => {
        const { openDatabase } = await import('../../src/db/database.ts');
        const { Migrator } = await import('kysely/migration');
        const { sql } = await import('kysely');
        const migrations = {
            '2026-10-27-initial': await import('../../src/db/migrations/2026-10-27-initial.ts'),
            '2026-10-27-person-entity-optional': await import('../../src/db/migrations/2026-10-27-person-entity-optional.ts'),
            '2026-10-27-slot-weekdays': await import('../../src/db/migrations/2026-10-27-slot-weekdays.ts'),
            '2026-10-27-templates-to-conditions': await import('../../src/db/migrations/2026-10-27-templates-to-conditions.ts'),
            '2026-10-27-visual-icons-and-colors': await import('../../src/db/migrations/2026-10-27-visual-icons-and-colors.ts'),
        };
        const without = await import('../../src/db/migrations/2026-10-27-without-assignment.ts');
        const db = openDatabase(':memory:');
        await new Migrator({ db, provider: { getMigrations: async () => migrations } }).migrateToLatest();
        for (const name of ['Andi', 'Kaddi', 'Kim']) await db.insertInto('person').values({ name }).execute();
        const chore = async (assignment: string, personIds: number[]) => {
            const { rows } = await sql<{ id: number }>`INSERT INTO chore (name, kind, growth, importance, duration_min,
                effort, assignment, last_done_at, created_at, updated_at)
                VALUES ('x', 'recurring', 'time', 'normal', 10, 1, ${assignment}, 0, 0, 0) RETURNING id`.execute(db);
            for (const personId of personIds) {
                await db.insertInto('chorePerson').values({ choreId: rows[0]!.id, personId }).execute();
            }
        };
        await chore('any', []);
        await chore('any', [1]);
        await chore('any', [1, 2]);
        await chore('all', []);
        await chore('all', [2, 3]);

        await without.up(db as never);
        const persons = async () => {
            const rows = await db.selectFrom('chorePerson').selectAll().orderBy('choreId').orderBy('personId').execute();
            return [1, 2, 3, 4, 5].map((id) => rows.filter((r) => r.choreId === id).map((r) => r.personId));
        };
        expect(await persons()).toEqual([[], [1], [], [1, 2, 3], [2, 3]]);

        await without.down(db as never);
        const rows = await sql<{ assignment: string }>`SELECT assignment FROM chore ORDER BY id`.execute(db);
        expect(rows.rows.map((r) => r.assignment)).toEqual(['any', 'any', 'any', 'all', 'all']);
        await db.destroy();
    });
});

describe('migration without-season-range', () => {
    it('converts the first and the last month to the months of the season and back', async () => {
        const { openDatabase, migrate } = await import('../../src/db/database.ts');
        const { Migrator } = await import('kysely/migration');
        const { sql } = await import('kysely');
        const names = ['initial', 'person-entity-optional', 'slot-weekdays', 'templates-to-conditions',
            'visual-icons-and-colors', 'without-assignment'];
        const migrations = Object.fromEntries(await Promise.all(names.map(async (name) =>
            [`2026-10-27-${name}`, await import(`../../src/db/migrations/2026-10-27-${name}.ts`)])));
        const range = await import('../../src/db/migrations/2026-10-27-without-season-range.ts');
        const db = openDatabase(':memory:');
        await new Migrator({ db, provider: { getMigrations: async () => migrations } }).migrateToLatest();
        for (const [from, to] of [[null, null], [4, 10], [11, 2]]) {
            await sql`INSERT INTO chore (name, kind, growth, importance, duration_min, effort, last_done_at, created_at,
                updated_at, season_from, season_to) VALUES ('x', 'recurring', 'time', 'normal', 10, 1, 0, 0, 0, ${from},
                ${to})`.execute(db);
        }

        await migrate(db);
        const months = await db.selectFrom('chore').select('seasonMonths').orderBy('id').execute();
        expect(months.map((r) => r.seasonMonths)).toEqual([0, 0b11_1111_1000, 0b1100_0000_0011]);

        await db.updateTable('chore').set({ seasonMonths: 0b1_0000_0110 }).where('id', '=', 1).execute();
        await range.down(db as never);
        const rows = await sql<{ seasonFrom: number | null; seasonTo: number | null }>`SELECT season_from, season_to
            FROM chore ORDER BY id`.execute(db);
        expect(rows.rows).toEqual([
            { seasonFrom: 2, seasonTo: 3 },
            { seasonFrom: 4, seasonTo: 10 },
            { seasonFrom: 11, seasonTo: 2 },
        ]);
        await db.destroy();
    });
});

describe('migration simpler-chores', () => {
    it('converts the chores, the conditions, the events and the settings and back', async () => {
        const { openDatabase, migrate } = await import('../../src/db/database.ts');
        const { Migrator } = await import('kysely/migration');
        const { sql } = await import('kysely');
        const names = ['initial', 'person-entity-optional', 'slot-weekdays', 'templates-to-conditions',
            'visual-icons-and-colors', 'without-assignment', 'without-season-range'];
        const migrations = Object.fromEntries(await Promise.all(names.map(async (name) =>
            [`2026-10-27-${name}`, await import(`../../src/db/migrations/2026-10-27-${name}.ts`)])));
        const simpler = await import('../../src/db/migrations/2026-10-28-simpler-chores.ts');
        const db = openDatabase(':memory:');
        await new Migrator({ db, provider: { getMigrations: async () => migrations } }).migrateToLatest();
        await sql`INSERT INTO condition (name, kind, template, result) VALUES ('Trocken', 'state', '{{ dry }}', 1)`.execute(db);
        await sql`INSERT INTO condition (name, kind, template, result) VALUES ('Sonnig', 'forecast', '{{ day.sun }}', 0)`
            .execute(db);
        const chore = (name: string, growth: string, condition: number | null, boost: number | null, forecast: number | null) =>
            sql`INSERT INTO chore (name, group_key, kind, growth, interval, importance, duration_min, effort, last_done_at,
                created_at, updated_at, condition_id, boost_id, forecast_id, season_months)
                VALUES (${name}, 'g', 'recurring', ${growth}, 7, 'critical', 10, 1, 5, 1, 2, ${condition}, ${boost},
                ${forecast}, 6)`.execute(db);
        await chore('Rasen', 'usage', 1, null, 2);
        await chore('Sprenger', 'time', null, 1, null);
        await chore('Filter', 'counter', null, null, null);
        await db.insertInto('category').values({ name: 'Garten' }).execute();
        await db.insertInto('choreCategory').values({ choreId: 1, categoryId: 1 }).execute();
        await sql`INSERT INTO event (chore_id, type, at, need_level, effort) VALUES (2, 'done', 9, 1.5, 3)`.execute(db);
        for (const key of ['slope.normal', 'earlier_max_need', 'earlier_window_seconds', 'suggest_threshold']) {
            await db.insertInto('setting').values({ key, value: '1' }).execute();
        }

        await migrate(db);
        expect(await db.selectFrom('chore').select(['id', 'name', 'pausesWhenAway', 'requiresId', 'triggerId', 'seasonMonths',
            'lastDoneAt']).orderBy('id').execute()).toEqual([
            { id: 1, name: 'Rasen', pausesWhenAway: 1, requiresId: 1, triggerId: null, seasonMonths: 6, lastDoneAt: 5 },
            { id: 2, name: 'Sprenger', pausesWhenAway: 0, requiresId: null, triggerId: 1, seasonMonths: 6, lastDoneAt: 5 },
            { id: 3, name: 'Filter', pausesWhenAway: 0, requiresId: null, triggerId: null, seasonMonths: 6, lastDoneAt: 5 },
        ]);
        const columns = (await db.introspection.getTables()).find((t) => t.name === 'chore')!.columns.map((c) => c.name);
        for (const gone of ['group_key', 'growth', 'importance', 'interval_min', 'learn_step', 'counter_entity',
            'deadline_lead_days', 'condition_id', 'boost_id', 'forecast_id']) {
            expect(columns).not.toContain(gone);
        }
        expect(await db.selectFrom('condition').select(['id', 'template', 'forecastTemplate', 'result', 'sinceAt'])
            .orderBy('id').execute()).toEqual([
            { id: 1, template: '{{ dry }}', forecastTemplate: null, result: 1, sinceAt: null },
            { id: 2, template: 'true', forecastTemplate: '{{ day.sun }}', result: null, sinceAt: null },
        ]);
        expect(await db.selectFrom('event').select(['choreId', 'durationMin', 'effort']).execute())
            .toEqual([{ choreId: 2, durationMin: 0, effort: 3 }]);
        expect((await db.selectFrom('setting').select('key').orderBy('key').execute()).map((r) => r.key))
            .toEqual(['suggest_threshold']);
        expect(await db.selectFrom('choreCategory').selectAll().execute()).toEqual([{ choreId: 1, categoryId: 1 }]);
        await expect(sql`INSERT INTO chore (name, kind, duration_min, effort, last_done_at, created_at, updated_at,
            requires_id) VALUES ('x', 'recurring', 1, 1, 0, 0, 0, 99)`.execute(db)).rejects.toThrow(/FOREIGN KEY/);

        await simpler.down(db as never);
        const rows = await sql<Record<string, unknown>>`SELECT growth, importance, interval_min, interval_max,
            condition_id, boost_id, forecast_id FROM chore ORDER BY id`.execute(db);
        expect(rows.rows).toEqual([
            { growth: 'usage', importance: 'normal', intervalMin: 0.875, intervalMax: 28, conditionId: 1, boostId: null,
                forecastId: null },
            { growth: 'time', importance: 'normal', intervalMin: 0.875, intervalMax: 28, conditionId: null, boostId: 1,
                forecastId: null },
            { growth: 'time', importance: 'normal', intervalMin: 0.875, intervalMax: 28, conditionId: null, boostId: null,
                forecastId: null },
        ]);
        const conditions = await sql<Record<string, unknown>>`SELECT kind, template FROM condition ORDER BY id`.execute(db);
        expect(conditions.rows).toEqual([{ kind: 'state', template: '{{ dry }}' }, { kind: 'forecast', template: '{{ day.sun }}' }]);
        expect((await db.introspection.getTables()).find((t) => t.name === 'event')!.columns.map((c) => c.name))
            .not.toContain('duration_min');
        await db.destroy();
    });
});

describe('migration unknown-last-done', () => {
    it('clears the last done time without a real done event and adds the start flag, and back', async () => {
        const { openDatabase, migrate } = await import('../../src/db/database.ts');
        const { Migrator } = await import('kysely/migration');
        const { sql } = await import('kysely');
        const names = ['2026-10-27-initial', '2026-10-27-person-entity-optional', '2026-10-27-slot-weekdays',
            '2026-10-27-templates-to-conditions', '2026-10-27-visual-icons-and-colors', '2026-10-27-without-assignment',
            '2026-10-27-without-season-range', '2026-10-28-simpler-chores'];
        const migrations = Object.fromEntries(await Promise.all(names.map(async (name) =>
            [name, await import(`../../src/db/migrations/${name}.ts`)])));
        const unknown = await import('../../src/db/migrations/2026-10-28-unknown-last-done.ts');
        const db = openDatabase(':memory:');
        await new Migrator({ db, provider: { getMigrations: async () => migrations } }).migrateToLatest();
        const chore = (name: string, kind: string, lastDoneAt: number) =>
            sql`INSERT INTO chore (name, kind, interval, duration_min, effort, last_done_at, created_at, updated_at)
                VALUES (${name}, ${kind}, 7, 10, 1, ${lastDoneAt}, 100, 100)`.execute(db);
        await chore('Projekt', 'one_time', 100);
        await chore('Neu', 'recurring', 100);
        await chore('Erledigt', 'recurring', 200);
        await chore('Importiert', 'recurring', 50);
        await db.insertInto('category').values({ name: 'Garten' }).execute();
        await db.insertInto('choreCategory').values({ choreId: 3, categoryId: 1 }).execute();
        await sql`INSERT INTO event (chore_id, type, at, need_level, effort) VALUES (3, 'done', 200, 1, 1)`.execute(db);

        await migrate(db);
        expect(await db.selectFrom('chore').select(['id', 'lastDoneAt']).orderBy('id').execute()).toEqual([
            { id: 1, lastDoneAt: null },
            { id: 2, lastDoneAt: null },
            { id: 3, lastDoneAt: 200 },
            { id: 4, lastDoneAt: 50 },
        ]);
        expect(await db.selectFrom('event').select(['choreId', 'startKnown']).execute()).toEqual([{ choreId: 3, startKnown: 1 }]);
        expect(await db.selectFrom('choreCategory').selectAll().execute()).toEqual([{ choreId: 3, categoryId: 1 }]);

        await unknown.down(db as never);
        expect(await db.selectFrom('chore').select(['id', 'lastDoneAt']).orderBy('id').execute()).toEqual([
            { id: 1, lastDoneAt: 100 },
            { id: 2, lastDoneAt: 100 },
            { id: 3, lastDoneAt: 200 },
            { id: 4, lastDoneAt: 50 },
        ]);
        await expect(sql`INSERT INTO chore (name, kind, duration_min, effort, created_at, updated_at)
            VALUES ('x', 'recurring', 1, 1, 0, 0)`.execute(db)).rejects.toThrow(/NOT NULL/);
        expect((await db.introspection.getTables()).find((t) => t.name === 'event')!.columns.map((c) => c.name))
            .not.toContain('start_known');
        await db.destroy();
    });
});
