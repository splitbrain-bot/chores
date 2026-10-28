import { describe, expect, it } from 'vitest';
import { byNeed, selectSuggestions } from '../../src/core/select.ts';
import type { BlockCode, ChoreWithNeed, Kind } from '../../src/core/types.ts';
import { makeChore, settings } from './fixtures.ts';

/**
 * Creates an evaluated chore. Without a name argument, each chore forms its own group.
 */
function evaluated(id: number, need: number, blockedBy: BlockCode[] = [], name = `c${id}`, kind: Kind = 'recurring',
    elapsed = 0): ChoreWithNeed {
    return { ...makeChore({ id, name, kind }), need, elapsed, urgent: false,
        possible: blockedBy.length === 0, blockedBy, reason: { code: 'trigger' } };
}

describe('byNeed', () => {
    it('sorts by need and then by the elapsed time', () => {
        const list = [evaluated(1, 1, [], 'a', 'recurring', 5), evaluated(2, 1, [], 'b', 'recurring', 9), evaluated(3, 2)];
        expect(list.sort(byNeed).map((c) => c.id)).toEqual([3, 2, 1]);
    });
});

describe('selectSuggestions', () => {
    it('sorts by need and limits the count', () => {
        const result = selectSuggestions([evaluated(1, 1), evaluated(2, 3), evaluated(3, 2), evaluated(4, 1.5)], settings);
        expect(result.map((s) => s.chore.id)).toEqual([2, 3, 4]);
    });

    it('skips chores that are not possible', () => {
        const result = selectSuggestions([evaluated(1, 5, ['need']), evaluated(2, 1)], settings);
        expect(result.map((s) => s.chore.id)).toEqual([2]);
    });

    it('groups chores with the same name and adds the also possible ones', () => {
        const result = selectSuggestions([
            evaluated(1, 1.2, [], 'floor'),
            evaluated(2, 0.8, ['need'], 'floor'),
            evaluated(3, 0.9, ['capacity'], 'floor'),
            evaluated(4, 0.5, ['need'], 'floor'),
            evaluated(5, 2, ['season'], 'floor'),
            evaluated(6, 1, []),
        ], settings);
        expect(result.map((s) => s.chore.id)).toEqual([1, 6]);
        expect(result[0]!.also.map((c) => c.id)).toEqual([3, 2]);
    });

    it('uses the threshold for also possible chores', () => {
        const result = selectSuggestions([evaluated(1, 1, [], 'g'), evaluated(2, 0.74, ['need'], 'g')], settings);
        expect(result[0]!.also).toEqual([]);
    });

    it('shows at most one one-time task while a recurring chore is possible', () => {
        const result = selectSuggestions([
            evaluated(1, 1, [], 'a', 'recurring', 7),
            evaluated(2, 1, [], 'b', 'one_time', 40),
            evaluated(3, 1, [], 'c', 'one_time', 30),
            evaluated(4, 0.95, [], 'd', 'recurring', 6),
        ], settings);
        expect(result.map((s) => s.chore.id)).toEqual([2, 1, 4]);
    });

    it('shows only one-time tasks when no recurring chore is possible', () => {
        const result = selectSuggestions([
            evaluated(1, 1, ['need'], 'a', 'recurring', 7),
            evaluated(2, 1, [], 'b', 'one_time', 40),
            evaluated(3, 1, [], 'c', 'one_time', 30),
        ], settings);
        expect(result.map((s) => s.chore.id)).toEqual([2, 3]);
    });
});
