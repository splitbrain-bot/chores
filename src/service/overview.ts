import { deadlines } from '../core/need.ts';
import { DAY, type Capacity, type ChoreWithNeed, type Kind } from '../core/types.ts';
import { listRecentEvents, type EventWithChore } from '../db/events.ts';
import type { Deps } from './deps.ts';
import { evaluate } from './evaluate.ts';
import { listPresence, type PersonPresence } from './presence.ts';

/** A chore with a deadline in the overview. */
export interface DeadlineEntry {
    chore: ChoreWithNeed;
    deadline: number;
}

/** The data for a chat summary of the household state. */
export interface Overview {
    presence: PersonPresence[];
    top: ChoreWithNeed[];
    neglected: ChoreWithNeed[];
    deadlines: DeadlineEntry[];
    recent: EventWithChore[];
    counts: {
        byKind: Record<Kind, number>;
        aboveOne: number;
    };
    capacityNow: { personId: number; name: string; capacity: Capacity }[];
}

/** Days ahead for the coming deadlines. */
const DEADLINE_DAYS = 30;

/**
 * Returns the overview.
 *
 * @param deps the dependencies
 */
export async function getOverview(deps: Deps): Promise<Overview> {
    const { state, chores } = await evaluate(deps, { kind: 'shared' });
    const byNeed = [...chores].sort((a, b) => b.need - a.need);
    const tz = state.settings.time_zone;
    const lead = state.settings.deadline_lead_days * DAY;

    const deadlineList: DeadlineEntry[] = [];
    for (const chore of chores) {
        const next = chore.deadlineMd !== null ? deadlines(chore, state.now + 365 * DAY, tz) : [];
        const candidates = [...deadlines(chore, state.now, tz), ...next];
        const coming = candidates.filter((d) => d > state.now && d <= state.now + DEADLINE_DAYS * DAY
            && !(chore.kind === 'recurring' && chore.lastDoneAt > chore.createdAt && chore.lastDoneAt >= d - lead));
        if (chore.reason.code === 'deadline') deadlineList.push({ chore, deadline: chore.reason.deadline });
        else if (coming.length > 0) deadlineList.push({ chore, deadline: Math.min(...coming) });
    }
    deadlineList.sort((a, b) => a.deadline - b.deadline);

    const byKind: Record<Kind, number> = { recurring: 0, one_time: 0 };
    for (const c of chores) byKind[c.kind]++;

    return {
        presence: await listPresence(deps),
        top: byNeed.slice(0, 15),
        neglected: byNeed.filter((c) => c.need >= 2),
        deadlines: deadlineList,
        recent: await listRecentEvents(deps.db, 30),
        counts: { byKind, aboveOne: chores.filter((c) => c.need >= 1).length },
        capacityNow: state.persons.map((p) => ({
            personId: p.id, name: p.name, capacity: state.capacities.get(p.id)?.capacity ?? { minutes: 0, energy: 0 },
        })),
    };
}
