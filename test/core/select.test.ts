import { describe, expect, it } from 'vitest';
import { selectSuggestions } from '../../src/core/select.ts';
import type { BlockCode, ChoreWithNeed } from '../../src/core/types.ts';
import { makeChore, settings } from './fixtures.ts';

/**
 * Creates an evaluated chore.
 */
function evaluated(id: number, need: number, blockedBy: BlockCode[] = [], groupKey: string | null = null): ChoreWithNeed {
    return { ...makeChore({ id, groupKey }), need, elapsed: 0, elapsedUnit: 'days', urgent: false,
        possible: blockedBy.length === 0, blockedBy, reason: { code: 'boost' } };
}

describe('selectSuggestions', () => {
    it('sorts by need and limits the count', () => {
        const result = selectSuggestions([evaluated(1, 1), evaluated(2, 3), evaluated(3, 2), evaluated(4, 1.5)], settings);
        expect(result.map((s) => s.chore.id)).toEqual([2, 3, 4]);
    });

    it('skips chores that are not possible', () => {
        const result = selectSuggestions([evaluated(1, 5, ['need']), evaluated(2, 1)], settings);
        expect(result.map((s) => s.chore.id)).toEqual([2]);
    });

    it('groups chores and adds the also possible ones', () => {
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
});
