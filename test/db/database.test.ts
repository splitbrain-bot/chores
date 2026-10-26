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
