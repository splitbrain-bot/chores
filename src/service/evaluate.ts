import { capacityFor, type CapacityResult } from '../core/capacity.ts';
import type { NeedContext } from '../core/need.ts';
import type { PossibleContext } from '../core/possible.ts';
import { evaluateChores } from '../core/select.ts';
import { nextSlotStart } from '../core/time.ts';
import {
    DAY,
    type CalendarEvent,
    type Capacity,
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
import { listEventsSince } from '../db/events.ts';
import { firstStateAt } from '../db/ha_state.ts';
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
    /** Events of the last two days. */
    recentEvents: ChoreEvent[];
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
 * Loads all data for the evaluation of chores.
 *
 * @param deps the dependencies
 */
export async function loadState(deps: Deps): Promise<EvalState> {
    const { db } = deps;
    const now = deps.now();
    const settings = await getSettings(db);
    const persons = await listPersons(db);
    const holidays = await loadHolidays(db);
    const calendars = await loadCalendars(db, persons);
    const recentEvents = await listEventsSince(db, now - 2 * DAY);

    const presence = new Map<number, PresenceState>();
    const capacities = new Map<number, CapacityResult>();
    for (const p of persons) {
        presence.set(p.id, await presenceOf(db, p, now));
        capacities.set(p.id, capacityFor(p.id, now, settings, holidays, calendars.get(p.id) ?? [], recentEvents));
    }

    // a person without a person entity is always at home, so the presence clock is the wall clock
    const tracked = persons.every((p) => p.haEntity);
    const needCtx: NeedContext = {
        now,
        settings,
        occupancy: tracked ? await listOccupancy(db) : [],
        firstRecordAt: tracked ? await firstStateAt(db, persons.map((p) => p.haEntity!)) : null,
    };
    const nextSlotAt = nextSlotStart(now, settings.time_zone, settings.capacity_slots, holidays);
    return { now, settings, persons, presence, capacities, holidays, calendars, recentEvents, needCtx, nextSlotAt };
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
    const state = await loadState(deps);
    return { state, chores: evaluateChores(chores, state.needCtx, possibleContext(state, viewer)) };
}
