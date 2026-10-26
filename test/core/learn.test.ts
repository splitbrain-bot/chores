import { describe, expect, it } from 'vitest';
import { learn } from '../../src/core/learn.ts';
import { makeChore } from './fixtures.ts';

describe('learn', () => {
    it('goes from 7 days to 1 day in five earlier taps with the default limits', () => {
        let chore = makeChore({ interval: 7, intervalMin: 7 / 8, intervalMax: 28 });
        const path = [chore.interval!];
        while (chore.interval! > 1) {
            chore = { ...chore, ...learn(chore, -1) };
            path.push(chore.interval!);
        }
        expect(path.map((v) => Number(v.toFixed(2)))).toEqual([7, 5.95, 4.61, 3.05, 1.53, 0.88]);
    });

    it('halves the step on a direction change', () => {
        const chore = makeChore({ interval: 10, learnStep: 0.3, learnDirection: -1 });
        expect(learn(chore, 1)).toEqual({ interval: 11.5, learnStep: 0.15, learnDirection: 1 });
    });

    it('keeps the step within its range', () => {
        expect(learn(makeChore({ learnStep: 0.4, learnDirection: 1 }), 1).learnStep).toBe(0.5);
        expect(learn(makeChore({ learnStep: 0.06, learnDirection: 1 }), -1).learnStep).toBe(0.05);
    });

    it('respects the limits', () => {
        expect(learn(makeChore({ interval: 7, intervalMin: 6.5 }), -1).interval).toBe(6.5);
        expect(learn(makeChore({ interval: 7, intervalMax: 7.5 }), 1).interval).toBe(7.5);
    });
});
