import { describe, expect, it } from 'vitest';
import { firstStateAt, insertStates, lastStateAt, lastValidStateBefore, latestState, listStates } from '../../src/db/ha_state.ts';
import { memoryDb } from './helpers.ts';

describe('ha_state', () => {
    it('stores and queries states', async () => {
        const db = await memoryDb();
        expect(await lastStateAt(db)).toBeNull();
        await insertStates(db, [
            { entityId: 'person.a', state: 'home', at: 10 },
            { entityId: 'person.k', state: 'home', at: 20 },
            { entityId: 'person.a', state: 'unavailable', at: 30 },
            { entityId: 'binary_sensor.x', state: 'on', at: 40 },
        ]);
        await insertStates(db, []);
        expect(await lastStateAt(db)).toBe(40);
        expect(await firstStateAt(db, ['person.k', 'person.a'])).toBe(10);
        expect(await firstStateAt(db, [])).toBeNull();
        expect((await listStates(db, ['person.a', 'person.k'])).map((s) => s.at)).toEqual([10, 20, 30]);
        expect((await listStates(db, ['person.a'], 20)).map((s) => s.state)).toEqual(['unavailable']);
        expect(await lastValidStateBefore(db, 'person.a', 100)).toMatchObject({ state: 'home', at: 10 });
        expect(await latestState(db, 'person.a')).toMatchObject({ state: 'unavailable' });
    });
});
