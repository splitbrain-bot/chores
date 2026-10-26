import { describe, expect, it } from 'vitest';
import { closeOccupancy, insertOccupancy, listOccupancy, openOccupancy, replaceOccupancy } from '../../src/db/occupancy.ts';
import { memoryDb } from './helpers.ts';

describe('occupancy', () => {
    it('opens, closes and replaces rows', async () => {
        const db = await memoryDb();
        await insertOccupancy(db, { startAt: 10, endAt: null, clockStart: 0 });
        expect(await openOccupancy(db)).toEqual({ startAt: 10, endAt: null, clockStart: 0 });
        await closeOccupancy(db, 20);
        expect(await openOccupancy(db)).toBeUndefined();
        await insertOccupancy(db, { startAt: 30, endAt: null, clockStart: 10 });
        expect(await listOccupancy(db)).toEqual([
            { startAt: 10, endAt: 20, clockStart: 0 },
            { startAt: 30, endAt: null, clockStart: 10 },
        ]);
        await replaceOccupancy(db, [{ startAt: 5, endAt: null, clockStart: 0 }]);
        expect(await listOccupancy(db)).toEqual([{ startAt: 5, endAt: null, clockStart: 0 }]);
        await replaceOccupancy(db, []);
        expect(await listOccupancy(db)).toEqual([]);
    });
});
