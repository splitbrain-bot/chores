import type { Chore } from './types.ts';

/** Smallest learning step. */
export const MIN_STEP = 0.05;

/** Largest learning step. */
export const MAX_STEP = 0.5;

/** Learned values of a chore after one signal. */
export interface LearnResult {
    interval: number;
    learnStep: number;
    learnDirection: -1 | 1;
}

/**
 * Changes the interval of a chore by one signal.
 *
 * The step grows by half when the signal has the same direction as the last one, and halves when the direction
 * changes. The first signal uses the current step.
 *
 * @param chore the chore with interval, limits, step and direction
 * @param direction -1 for "necessary earlier", +1 for "not necessary yet"
 */
export function learn(chore: Pick<Chore, 'interval' | 'intervalMin' | 'intervalMax' | 'learnStep' | 'learnDirection'>,
    direction: -1 | 1): LearnResult {
    const interval = chore.interval ?? 0;
    let step = chore.learnStep;
    if (chore.learnDirection === direction) step = Math.min(step * 1.5, MAX_STEP);
    else if (chore.learnDirection !== 0) step = Math.max(step / 2, MIN_STEP);

    let next = interval * (1 + direction * step);
    if (chore.intervalMin !== null) next = Math.max(next, chore.intervalMin);
    if (chore.intervalMax !== null) next = Math.min(next, chore.intervalMax);
    return { interval: next, learnStep: step, learnDirection: direction };
}
