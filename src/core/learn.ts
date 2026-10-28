import type { Settings } from './types.ts';

/** Shortest interval in days that the learning can set. */
export const MIN_INTERVAL = 0.5;

/** Longest interval in days that the learning can set. */
export const MAX_INTERVAL = 730;

/** Direction of a learning signal: -1 for "necessary earlier", 1 for "not necessary yet". */
export type Direction = -1 | 1;

/**
 * Returns the interval that a signal aims at. "Necessary earlier" at the elapsed time e says that the interval is
 * shorter than e. "Not necessary yet" says that it is longer. The margin keeps the target away from e. A target
 * never moves the interval against the direction of the signal.
 *
 * @param interval the current interval
 * @param elapsed the elapsed days at the time of the signal
 * @param direction the direction of the signal
 * @param margin the distance from the elapsed time as a part of it
 */
export function learnTarget(interval: number, elapsed: number, direction: Direction, margin: number): number {
    return direction < 0 ? Math.min(interval, elapsed * (1 - margin)) : Math.max(interval, elapsed * (1 + margin));
}

/**
 * Tells if a signal can change the interval. A signal cannot change it when the interval already agrees with the
 * target, for example "necessary earlier" at an elapsed time well after the interval.
 *
 * @param interval the current interval
 * @param elapsed the elapsed days at the time of the signal
 * @param direction the direction of the signal
 * @param margin the learning margin
 */
export function canLearn(interval: number, elapsed: number, direction: Direction, margin: number): boolean {
    return learnTarget(interval, elapsed, direction, margin) !== interval;
}

/**
 * Changes the interval of a chore by one signal. The interval moves by the rate toward the target. A repeated
 * signal in the same direction moves it to the target at once, because the first change was too small. One signal
 * changes the interval at most by the factor 2.
 *
 * @param interval the current interval
 * @param elapsed the elapsed days at the time of the signal
 * @param direction the direction of the signal
 * @param repeated true when the last signal of the chore had the same direction
 * @param settings the settings with the margin and the rate
 * @returns the new interval
 */
export function learn(interval: number, elapsed: number, direction: Direction, repeated: boolean, settings: Settings):
    number {
    const target = learnTarget(interval, elapsed, direction, settings.learn_margin);
    const rate = repeated ? 1 : settings.learn_rate;
    let next = interval + rate * (target - interval);
    next = Math.min(Math.max(next, interval / 2), interval * 2);
    return Math.min(Math.max(next, MIN_INTERVAL), MAX_INTERVAL);
}
