import { describe, expect, it } from 'vitest';
import { deleteCache, getCache, listCache, setCache } from '../../src/db/cache.ts';
import { memoryDb } from './helpers.ts';

describe('cache', () => {
    it('stores, lists and deletes values by prefix', async () => {
        const db = await memoryDb();
        await setCache(db, 'forecast:daily', [{ a: 1 }], 10);
        await setCache(db, 'forecast_template:1:2026-10-30', true, 11);
        await setCache(db, 'forecast_template:1:2026-10-31', false, 12);
        await setCache(db, 'forecast:daily', [{ a: 2 }], 13);
        expect(await getCache(db, 'forecast:daily')).toEqual({ value: [{ a: 2 }], fetchedAt: 13 });
        expect([...(await listCache(db, 'forecast_template:1:')).keys()]).toHaveLength(2);
        await deleteCache(db, 'forecast_template:');
        expect(await listCache(db, 'forecast_template:')).toEqual(new Map());
        expect(await getCache(db, 'forecast:daily')).toBeDefined();
        expect(await getCache(db, 'missing')).toBeUndefined();
    });
});
