import { describe, expect, it } from 'vitest';
import { createChore } from '../../src/db/chores.ts';
import { getEvent, hasEarlierBetween, insertEvent, listChoreEvents, listDoneSince, listRecentEvents } from '../../src/db/events.ts';
import type { ChoreEvent } from '../../src/core/types.ts';
import { newChore } from './fixtures.ts';
import { memoryDb } from './helpers.ts';

/**
 * Creates event values.
 */
function ev(over: Partial<ChoreEvent>): Omit<ChoreEvent, 'id'> {
    return { choreId: 1, type: 'done', reason: null, at: 0, personId: null, needLevel: 1, intervalBefore: 7,
        intervalAfter: 7, effort: 2, ...over };
}

describe('events', () => {
    it('inserts and queries events', async () => {
        const db = await memoryDb();
        await createChore(db, newChore({ name: 'Boden' }));
        const id1 = await insertEvent(db, ev({ at: 100 }));
        await insertEvent(db, ev({ at: 150, type: 'earlier', intervalAfter: 6 }));
        await insertEvent(db, ev({ at: 300, type: 'postpone', reason: 'not_yet' }));
        expect(await getEvent(db, id1)).toMatchObject({ id: id1, at: 100, type: 'done' });
        expect((await listChoreEvents(db, 1)).map((e) => e.at)).toEqual([300, 150, 100]);
        expect((await listChoreEvents(db, 1, 1)).map((e) => e.at)).toEqual([300]);
        expect((await listRecentEvents(db))[0]).toMatchObject({ choreName: 'Boden', reason: 'not_yet' });
        expect((await listDoneSince(db, 50)).map((e) => e.id)).toEqual([id1]);
        expect(await listDoneSince(db, 101)).toEqual([]);
        expect(await hasEarlierBetween(db, 1, 100, 160)).toBe(true);
        expect(await hasEarlierBetween(db, 1, 200, 400)).toBe(false);
    });
});
