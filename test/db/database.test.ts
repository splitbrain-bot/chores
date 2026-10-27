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
            'event', 'ha_state', 'occupancy', 'person', 'setting', 'token']);
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
