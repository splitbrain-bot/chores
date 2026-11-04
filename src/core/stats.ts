import { addDays, localParts } from './time.ts';
import type { ChoreEvent } from './types.ts';

/** The done chores of one calendar week. */
export interface WeekStats {
    /** Local date YYYY-MM-DD of the Monday. */
    start: string;
    /** Number of done chores. */
    tasks: number;
    /** Sum of the effort of the done chores. */
    effort: number;
}

/**
 * Returns the local date of the Monday of the calendar week of a timestamp.
 *
 * @param ts milliseconds since the epoch
 * @param timeZone IANA time zone
 */
export function weekStart(ts: number, timeZone: string): string {
    const { date, weekday } = localParts(ts, timeZone);
    return addDays(date, -((weekday + 6) % 7));
}

/**
 * Counts the done chores and their effort per calendar week, from Monday to Sunday. The last week is the current
 * week.
 *
 * @param events the done events
 * @param now milliseconds since the epoch
 * @param timeZone IANA time zone
 * @param weeks the number of weeks
 * @returns the weeks, oldest first
 */
export function weeklyStats(events: readonly Pick<ChoreEvent, 'at' | 'effort'>[], now: number, timeZone: string,
    weeks: number): WeekStats[] {
    const current = weekStart(now, timeZone);
    const result = Array.from({ length: weeks }, (_, i) =>
        ({ start: addDays(current, (i - weeks + 1) * 7), tasks: 0, effort: 0 }));
    const byStart = new Map(result.map((w) => [w.start, w]));
    for (const event of events) {
        const week = byStart.get(weekStart(event.at, timeZone));
        if (!week) continue;
        week.tasks++;
        week.effort += event.effort;
    }
    return result;
}
