import { describe, expect, it } from 'vitest';
import { canLearn, learn, learnTarget, MAX_INTERVAL, MIN_INTERVAL } from '../../src/core/learn.ts';
import { settings } from './fixtures.ts';

describe('learnTarget', () => {
    it('aims below the elapsed time for earlier and above it for not yet', () => {
        expect(learnTarget(14, 12, -1, 0.25)).toBe(9);
        expect(learnTarget(14, 12, 1, 0.25)).toBe(15);
    });

    it('never moves the interval against the signal', () => {
        expect(learnTarget(14, 20, -1, 0.25)).toBe(14);
        expect(learnTarget(14, 8, 1, 0.25)).toBe(14);
        expect(canLearn(14, 20, -1, 0.25)).toBe(false);
        expect(canLearn(14, 12, -1, 0.25)).toBe(true);
    });
});

describe('learn', () => {
    it.each([
        [14, -1, 12.25],
        [6, -1, 9.25],
        [12.6, 1, 14.875],
        [25, 1, 22.625],
    ] as [number, -1 | 1, number][])('moves 14 days by half of the distance for elapsed %s and direction %s', (elapsed, direction, expected) => {
        expect(learn(14, elapsed, direction, false, settings)).toBeCloseTo(expected);
    });

    it('moves to the target at once for a repeated signal', () => {
        expect(learn(14, 14, -1, true, settings)).toBeCloseTo(10.5);
        expect(learn(14, 20, 1, true, settings)).toBeCloseTo(25);
    });

    it('uses the rate and the margin of the settings', () => {
        expect(learn(14, 14, -1, false, { ...settings, learn_rate: 1, learn_margin: 0.5 })).toBeCloseTo(7);
    });

    it('changes the interval at most by the factor 2 per signal', () => {
        expect(learn(14, 1, -1, true, settings)).toBe(7);
        expect(learn(14, 100, 1, true, settings)).toBe(28);
    });

    it('stays within the global limits', () => {
        expect(learn(0.6, 0.1, -1, true, settings)).toBe(MIN_INTERVAL);
        expect(learn(730, 2000, 1, true, settings)).toBe(MAX_INTERVAL);
    });
});
