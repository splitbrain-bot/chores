import { DEFAULT_SETTINGS, type Chore, type PresenceState, type Settings } from '../../src/core/types.ts';

/** Default settings for the tests. */
export const settings: Settings = DEFAULT_SETTINGS;

/**
 * Converts a local Berlin time with an explicit offset to a timestamp.
 *
 * @param iso date and time with offset, for example 2026-10-26T10:00+01:00
 */
export function at(iso: string): number {
    return Date.parse(iso);
}

/**
 * Creates a chore with test defaults.
 *
 * @param over values that replace the defaults
 */
export function makeChore(over: Partial<Chore> = {}): Chore {
    return {
        id: 1, name: 'Test', groupKey: null, kind: 'recurring', growth: 'time', interval: 7, intervalMin: null,
        intervalMax: null, learnStep: 0.15, learnDirection: 0, counterEntity: null, importance: 'normal',
        deadlineMd: null, deadlineAt: null, deadlineLeadDays: 14, conditionId: null, boostId: null,
        forecastId: null, conditionResult: null, boostResult: null, templateError: null, durationMin: 10,
        effort: 2, assignment: 'any', seasonFrom: null, seasonTo: null, noisy: false, notes: null,
        lastDoneAt: at('2026-10-01T10:00+02:00'), snoozedUntil: null, notYetCount: 0, lastNotifiedAt: null,
        createdAt: at('2026-01-01T10:00+01:00'), updatedAt: 0, deletedAt: null, personIds: [], categoryIds: [],
        ...over,
    };
}

/**
 * Creates a presence map.
 *
 * @param states presence per person id
 */
export function presence(states: Record<number, Partial<PresenceState>>): Map<number, PresenceState> {
    return new Map(Object.entries(states).map(([id, p]) => [Number(id),
        { personId: Number(id), home: false, since: null, distanceKm: null, ...p }]));
}
