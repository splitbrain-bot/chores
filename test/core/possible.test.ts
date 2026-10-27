import { describe, expect, it } from 'vitest';
import { baseBlocks, blocks, doers, type PossibleContext } from '../../src/core/possible.ts';
import { HOUR, type Capacity, type PresenceState, type Viewer } from '../../src/core/types.ts';
import { at, makeChore, presence, settings } from './fixtures.ts';

// Wednesday
const now = at('2026-10-28T18:00+01:00');
const full: Capacity = { minutes: 45, energy: 3 };

/**
 * Creates a filter context.
 */
function ctx(viewer: Viewer, states: Record<number, Partial<PresenceState>>, personIds = [1, 2],
    over: Partial<PossibleContext> = {}): PossibleContext {
    return {
        now, settings, viewer, personIds, presence: presence(states),
        capacities: new Map(personIds.map((id) => [id, full])), holidays: new Set(), ...over,
    };
}

const shared: Viewer = { kind: 'shared' };
const p1: Viewer = { kind: 'person', personId: 1 };
const p2: Viewer = { kind: 'person', personId: 2 };

describe('one person or any person', () => {
    const chore = makeChore({ personIds: [1] });

    it('shared device: needs a candidate at home', () => {
        expect(doers(chore, ctx(shared, { 1: { home: true }, 2: { home: true } }))).toEqual([1]);
        expect(doers(chore, ctx(shared, { 1: { home: false }, 2: { home: true } }))).toEqual([]);
    });

    it('person: needs the person in S and at home', () => {
        expect(doers(chore, ctx(p1, { 1: { home: true } }))).toEqual([1]);
        expect(doers(chore, ctx(p1, { 1: { home: false } }))).toEqual([]);
        expect(doers(chore, ctx(p2, { 1: { home: true }, 2: { home: true } }))).toEqual([]);
    });

    it('empty S means every person', () => {
        const anyone = makeChore();
        expect(doers(anyone, ctx(p2, { 1: { home: false }, 2: { home: true } }))).toEqual([2]);
        expect(doers(anyone, ctx(shared, { 1: { home: false }, 2: { home: true } }))).toEqual([2]);
    });
});

describe('more persons together', () => {
    const chore = makeChore({ personIds: [1, 2] });

    it('shared device: needs every assigned person at home', () => {
        expect(doers(chore, ctx(shared, { 1: { home: true }, 2: { home: true } }))).toEqual([1, 2]);
        expect(doers(chore, ctx(shared, { 1: { home: true }, 2: { home: false } }))).toEqual([]);
    });

    it('person: needs the person in S and every assigned person at home', () => {
        expect(doers(chore, ctx(p1, { 1: { home: true }, 2: { home: true } }))).toEqual([1]);
        expect(doers(chore, ctx(p1, { 1: { home: true }, 2: { home: false } }))).toEqual([]);
    });

    it('works with three persons', () => {
        const states = { 1: { home: true }, 2: { home: true }, 3: { home: false } };
        expect(doers(chore, ctx(shared, states, [1, 2, 3]))).toEqual([1, 2]);
        expect(doers(chore, ctx({ kind: 'person', personId: 3 }, states, [1, 2, 3]))).toEqual([]);
        expect(doers(makeChore({ personIds: [1, 3] }), ctx(shared, states, [1, 2, 3]))).toEqual([]);
        expect(doers(makeChore(), ctx(shared, states, [1, 2, 3]))).toEqual([1, 2]);
    });
});

describe('handover', () => {
    const chore = makeChore({ personIds: [1], importance: 'important' });

    it('applies after a long absence by time', () => {
        const states = { 1: { home: false, since: now - 25 * HOUR }, 2: { home: true } };
        expect(doers(chore, ctx(p2, states))).toEqual([2]);
        expect(doers(chore, ctx(shared, states))).toEqual([2]);
    });

    it('does not apply for a short absence nearby', () => {
        const states = { 1: { home: false, since: now - 9 * HOUR, distanceKm: 15 }, 2: { home: true } };
        expect(doers(chore, ctx(p2, states))).toEqual([]);
    });

    it('applies at once for a far distance', () => {
        const states = { 1: { home: false, since: now - HOUR, distanceKm: 300 }, 2: { home: true } };
        expect(doers(chore, ctx(p2, states))).toEqual([2]);
    });

    it('does not apply to normal chores', () => {
        const states = { 1: { home: false, since: now - 48 * HOUR }, 2: { home: true } };
        expect(doers({ ...chore, importance: 'normal' }, ctx(p2, states))).toEqual([]);
    });

    it('does not apply to chores of more persons', () => {
        const states = { 1: { home: false, since: now - 48 * HOUR }, 2: { home: false, since: now - 48 * HOUR },
            3: { home: true } };
        const p3: Viewer = { kind: 'person', personId: 3 };
        expect(doers({ ...chore, personIds: [1, 2] }, ctx(p3, states, [1, 2, 3]))).toEqual([]);
    });
});

describe('other filters', () => {
    const states = { 1: { home: true }, 2: { home: true } };

    it('blocks noisy chores on a Sunday and on a holiday', () => {
        const noisy = makeChore({ noisy: true });
        const sunday = at('2026-11-01T11:00+01:00');
        expect(baseBlocks(noisy, ctx(p1, states, [1, 2], { now: sunday }))).toContain('quiet_day');
        expect(baseBlocks(noisy, ctx(p1, states, [1, 2], { holidays: new Set(['2026-10-28']) }))).toContain('quiet_day');
        expect(baseBlocks(noisy, ctx(p1, states))).toEqual([]);
    });

    it('blocks snoozed chores until the snooze ends', () => {
        expect(baseBlocks(makeChore({ snoozedUntil: now + 1 }), ctx(p1, states))).toContain('snoozed');
        expect(baseBlocks(makeChore({ snoozedUntil: now }), ctx(p1, states))).toEqual([]);
    });

    it('blocks by the condition result', () => {
        const chore = makeChore({ conditionId: 1 });
        expect(baseBlocks({ ...chore, conditionResult: 1 }, ctx(p1, states))).toEqual([]);
        expect(baseBlocks({ ...chore, conditionResult: 0 }, ctx(p1, states))).toContain('condition');
        expect(baseBlocks({ ...chore, conditionResult: null }, ctx(p1, states))).toContain('condition');
    });

    it('blocks by season', () => {
        expect(baseBlocks(makeChore({ seasonMonths: [4, 5, 6, 7, 8, 9] }), ctx(p1, states))).toContain('season');
    });

    it('checks the capacity and the need threshold', () => {
        const big = makeChore({ durationMin: 60 });
        expect(blocks(big, 1, false, ctx(p1, states))).toEqual(['capacity']);
        expect(blocks(makeChore(), 0.5, false, ctx(p1, states))).toEqual(['need']);
        expect(blocks(makeChore(), 0.5, true, ctx(p1, states))).toEqual([]);
    });
});
