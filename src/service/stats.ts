import { weeklyStats, type WeekStats } from '../core/stats.ts';
import { DAY, type Viewer } from '../core/types.ts';
import { listDoneEvents } from '../db/events.ts';
import { getSettings } from '../db/settings.ts';
import type { Deps } from './deps.ts';
import { ServiceError } from './errors.ts';

/** Number of calendar weeks in the statistics, including the current week. */
const WEEKS = 52;

/**
 * Returns the done chores and their effort per calendar week of the person of the viewer.
 *
 * @param deps the dependencies
 * @param viewer the viewer
 * @returns the weeks, oldest first, the last one is the current week
 * @throws ServiceError 403 when the viewer is not a person
 */
export async function getStats(deps: Deps, viewer: Viewer): Promise<{ weeks: WeekStats[] }> {
    if (viewer.kind !== 'person') throw new ServiceError(403, 'Only a person has statistics');
    const now = deps.now();
    const { time_zone: timeZone } = await getSettings(deps.db);
    // one week more than necessary, weeklyStats drops the older events
    const events = await listDoneEvents(deps.db, viewer.personId, now - (WEEKS + 1) * 7 * DAY);
    return { weeks: weeklyStats(events, now, timeZone, WEEKS) };
}
