import type { NewChore } from '../../src/db/chores.ts';

/**
 * Creates chore values for an insert.
 *
 * @param over values that replace the defaults
 */
export function newChore(over: Partial<NewChore> = {}): NewChore {
    return {
        name: 'Test', kind: 'recurring', interval: 7, pausesWhenAway: false, deadlineMd: null, deadlineAt: null,
        requiresId: null, triggerId: null, requiresResult: null, triggerResult: null, triggerSinceAt: null,
        templateError: null, durationMin: 10, effort: 2, seasonMonths: [], noisy: false, notes: null, lastDoneAt: 1000,
        snoozedUntil: null, notYetCount: 0, lastNotifiedAt: null, createdAt: 1000, updatedAt: 1000, deletedAt: null,
        personIds: [], categoryIds: [], ...over,
    };
}
