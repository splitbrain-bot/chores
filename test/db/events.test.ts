import { describe, expect, it } from 'vitest';
import { createChore } from '../../src/db/chores.ts';
import {
    getEvent, insertEvent, lastEvent, lastLearnEvent, listChoreEvents, listEventsSince, listRecentEvents,
} from '../../src/db/events.ts';
import type { ChoreEvent } from '../../src/core/types.ts';
import { newChore } from './fixtures.ts';
import { memoryDb } from './helpers.ts';

/**
 * Creates event values.
 */
function ev(over: Partial<ChoreEvent>): Omit<ChoreEvent, 'id'> {
    return { choreId: 1, type: 'done', reason: null, at: 0, personId: null, needLevel: 1, intervalBefore: 7,
        intervalAfter: 7, durationMin: 10, effort: 2, startKnown: true, ...over };
}

describe('events', () => {
    it('inserts and queries events', async () => {
        const db = await memoryDb();
        await createChore(db, newChore({ name: 'Boden' }));
        await createChore(db, newChore({ name: 'Fenster' }));
        const id1 = await insertEvent(db, ev({ at: 100 }));
        await insertEvent(db, ev({ at: 150, type: 'earlier', intervalAfter: 6 }));
        await insertEvent(db, ev({ at: 200, type: 'postpone', reason: 'no_time' }));
        const id4 = await insertEvent(db, ev({ at: 300, type: 'postpone', reason: 'not_yet' }));
        const id5 = await insertEvent(db, ev({ at: 400, durationMin: 25 }));
        await insertEvent(db, ev({ at: 500, choreId: 2, type: 'earlier' }));
        expect(await getEvent(db, id1)).toMatchObject({ id: id1, at: 100, type: 'done', durationMin: 10 });
        expect(await getEvent(db, id5)).toMatchObject({ durationMin: 25 });
        expect((await listChoreEvents(db, 1)).map((e) => e.at)).toEqual([400, 300, 200, 150, 100]);
        expect((await listChoreEvents(db, 1, 1)).map((e) => e.at)).toEqual([400]);
        expect((await listRecentEvents(db))[0]).toMatchObject({ choreName: 'Fenster', type: 'earlier' });
        expect((await listEventsSince(db, 150)).map((e) => e.at)).toEqual([150, 200, 300, 400, 500]);
        expect(await listEventsSince(db, 501)).toEqual([]);
        expect((await lastEvent(db, 1))?.id).toBe(id5);
        expect(await lastEvent(db, 3)).toBeUndefined();
        expect((await lastLearnEvent(db, 1))?.id).toBe(id4);
        expect((await lastLearnEvent(db, 2))?.type).toBe('earlier');
        expect(await lastLearnEvent(db, 3)).toBeUndefined();
    });

    it('orders events of the same time by their id', async () => {
        const db = await memoryDb();
        await createChore(db, newChore({ name: 'Boden' }));
        const first = await insertEvent(db, ev({ at: 100, type: 'earlier' }));
        const second = await insertEvent(db, ev({ at: 100, type: 'postpone', reason: 'not_yet' }));
        expect((await lastEvent(db, 1))?.id).toBe(second);
        expect((await lastLearnEvent(db, 1))?.id).toBe(second);
        expect((await listEventsSince(db, 0)).map((e) => e.id)).toEqual([first, second]);
    });
});
