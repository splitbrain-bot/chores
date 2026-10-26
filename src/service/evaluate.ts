import { capacityFor, type CapacityResult } from '../core/capacity.ts';
import { countCycles, type NeedContext } from '../core/need.ts';
import type { PossibleContext } from '../core/possible.ts';
import { evaluateChores } from '../core/select.ts';
import { nextSlotStart } from '../core/time.ts';
import {
    DAY,
    type CalendarEvent,
    type Capacity,
    type Chore,
    type ChoreEvent,
    type ChoreWithNeed,
    type Person,
    type PresenceState,
    type Settings,
    type Viewer,
} from '../core/types.ts';
import { getCache } from '../db/cache.ts';
import { listChores, type ChoreFilter } from '../db/chores.ts';
import type { Database } from '../db/database.ts';
import { listDoneSince } from '../db/events.ts';
import { firstStateAt, lastValidStateBefore, listStates } from '../db/ha_state.ts';
import { listOccupancy } from '../db/occupancy.ts';
import { listPersons } from '../db/persons.ts';
import { getSettings } from '../db/settings.ts';
import type { Deps } from './deps.ts';
import { presenceOf } from './presence.ts';

/** Cache key of the public holidays. */
export const HOLIDAYS_KEY = 'holidays';

/** Cache key of the daily forecast. */
export const FORECAST_KEY = 'forecast:daily';

/**
 * Returns the cache key of the events of a calendar.
 *
 * @param entityId the calendar entity
 */
export function calendarKey(entityId: string): string {
    return `calendar:${entityId}`;
}

/** All data for the evaluation of the chores at one moment. */
export interface EvalState {
    now: number;
    settings: Settings;
    persons: Person[];
    presence: Map<number, PresenceState>;
    capacities: Map<number, CapacityResult>;
    holidays: Set<string>;
    calendars: Map<number, CalendarEvent[]>;
    recentDone: ChoreEvent[];
    needCtx: NeedContext;
    /** Start of the next capacity slot, null when the slot table is empty. */
    nextSlotAt: number | null;
}

/**
 * Loads the public holidays from the cache.
 *
 * @param db the database
 */
export async function loadHolidays(db: Database): Promise<Set<string>> {
    return new Set((await getCache<string[]>(db, HOLIDAYS_KEY))?.value ?? []);
}

/**
 * Loads the cached calendar events of every person.
 *
 * @param db the database
 * @param persons the persons
 */
export async function loadCalendars(db: Database, persons: readonly Person[]): Promise<Map<number, CalendarEvent[]>> {
    const result = new Map<number, CalendarEvent[]>();
    for (const p of persons) {
        const cached = p.calendarEntity ? await getCache<CalendarEvent[]>(db, calendarKey(p.calendarEntity)) : undefined;
        result.set(p.id, cached?.value ?? []);
    }
    return result;
}

/**
 * Counts the completed cycles of every counter chore since its last done event.
 *
 * @param db the database
 * @param chores the chores
 */
async function loadCycles(db: Database, chores: readonly Chore[]): Promise<Map<number, number>> {
    const cycles = new Map<number, number>();
    for (const c of chores) {
        if (c.growth !== 'counter' || !c.counterEntity) continue;
        const initial = await lastValidStateBefore(db, c.counterEntity, c.lastDoneAt);
        const states = await listStates(db, [c.counterEntity], c.lastDoneAt);
        cycles.set(c.id, countCycles(states.map((s) => s.state), initial?.state ?? null));
    }
    return cycles;
}

/**
 * Loads all data for the evaluation of chores.
 *
 * @param deps the dependencies
 * @param chores the chores to evaluate, for the counter cycles
 */
export async function loadState(deps: Deps, chores: readonly Chore[]): Promise<EvalState> {
    const { db } = deps;
    const now = deps.now();
    const settings = await getSettings(db);
    const persons = await listPersons(db);
    const holidays = await loadHolidays(db);
    const calendars = await loadCalendars(db, persons);
    const recentDone = await listDoneSince(db, now - 2 * DAY);

    const presence = new Map<number, PresenceState>();
    const capacities = new Map<number, CapacityResult>();
    for (const p of persons) {
        presence.set(p.id, await presenceOf(db, p, now));
        capacities.set(p.id, capacityFor(p.id, now, settings, holidays, calendars.get(p.id) ?? [], recentDone));
    }

    const needCtx: NeedContext = {
        now,
        settings,
        occupancy: await listOccupancy(db),
        firstRecordAt: await firstStateAt(db, persons.map((p) => p.haEntity)),
        cycles: await loadCycles(db, chores),
    };
    const nextSlotAt = nextSlotStart(now, settings.time_zone, settings.capacity_slots, holidays);
    return { now, settings, persons, presence, capacities, holidays, calendars, recentDone, needCtx, nextSlotAt };
}

/**
 * Builds the filter context for a viewer.
 *
 * @param state the evaluation state
 * @param viewer the viewer
 */
export function possibleContext(state: EvalState, viewer: Viewer): PossibleContext {
    const capacities = new Map<number, Capacity>([...state.capacities].map(([id, c]) => [id, c.capacity]));
    return {
        now: state.now,
        settings: state.settings,
        viewer,
        personIds: state.persons.map((p) => p.id),
        presence: state.presence,
        capacities,
        holidays: state.holidays,
    };
}

/**
 * Loads and evaluates chores for a viewer.
 *
 * @param deps the dependencies
 * @param viewer the viewer
 * @param filter the chore filter
 */
export async function evaluate(deps: Deps, viewer: Viewer, filter: ChoreFilter = {}):
    Promise<{ state: EvalState; chores: ChoreWithNeed[] }> {
    const chores = await listChores(deps.db, filter);
    const state = await loadState(deps, chores);
    return { state, chores: evaluateChores(chores, state.needCtx, possibleContext(state, viewer)) };
}
