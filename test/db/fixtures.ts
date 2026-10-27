import type { NewChore } from '../../src/db/chores.ts';

/**
 * Creates chore values for an insert.
 *
 * @param over values that replace the defaults
 */
export function newChore(over: Partial<NewChore> = {}): NewChore {
    return {
        name: 'Test', groupKey: null, kind: 'recurring', growth: 'time', interval: 7, intervalMin: 0.875,
        intervalMax: 28, learnStep: 0.15, learnDirection: 0, counterEntity: null, importance: 'normal',
        deadlineMd: null, deadlineAt: null, deadlineLeadDays: 14, conditionId: null, boostId: null,
        forecastId: null, conditionResult: null, boostResult: null, templateError: null, durationMin: 10,
        effort: 2, seasonMonths: [], noisy: false, notes: null, lastDoneAt: 1000,
        snoozedUntil: null, notYetCount: 0, lastNotifiedAt: null, createdAt: 1000, updatedAt: 1000, deletedAt: null,
        personIds: [], categoryIds: [], ...over,
    };
}
