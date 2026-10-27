import { capacityFor } from '../../src/core/capacity.ts';
import { buildOccupancy } from '../../src/core/clock.ts';
import { done, earlier, postpone } from '../../src/core/feedback.ts';
import type { NeedContext } from '../../src/core/need.ts';
import type { PossibleContext } from '../../src/core/possible.ts';
import { evaluateChores, selectSuggestions } from '../../src/core/select.ts';
import { addDays, localParts, nextSlotStart, slotsOfDay, startOfDay, zonedTime } from '../../src/core/time.ts';
import {
    DAY, DEFAULT_SETTINGS, MINUTE, type Capacity, type Chore, type ChoreEvent, type ChoreWithNeed, type Growth,
    type Importance, type Kind, type OccupancyRow, type PresenceState, type Settings, type StateRecord,
} from '../../src/core/types.ts';

/** Options of the simulation, read from the command line as key=value pairs. */
const options = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=') as [string, string]));
const SEED = Number(options.seed ?? 1);
const YEAR = Number(options.year ?? 2027);
const settings: Settings = { ...DEFAULT_SETTINGS, ...(options.settings ? JSON.parse(options.settings) : {}) };
const tz = settings.time_zone;

const PERSONS = [1, 2];
const ENTITIES = ['person.a', 'person.k'];
const VACATION_START = `${YEAR}-08-01`;
const VACATION_END = `${YEAR}-08-22`;

/**
 * Creates a seeded random generator with values from 0 to 1.
 *
 * @param seed the seed
 */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const random = mulberry32(SEED);

/**
 * Returns a random element of a list.
 *
 * @param list the list
 */
function pick<T>(list: readonly T[]): T {
    return list[Math.floor(random() * list.length)]!;
}

/** A simulated chore with the interval that the users feel. */
interface SimChore extends Chore {
    /** Returns the true interval at a moment. */
    trueInterval: (at: number) => number;
}

/**
 * Tells if a moment is in the shedding season of the dog.
 *
 * @param at milliseconds since the epoch
 */
function shedding(at: number): boolean {
    const { month, day } = localParts(at, tz);
    const md = month * 100 + day;
    return (md >= 315 && md <= 615) || (md >= 915 && md <= 1215);
}

/**
 * Generates about 150 chores that mirror the Todoist data.
 *
 * @param start the start of the simulation
 */
function generateChores(start: number): SimChore[] {
    const chores: SimChore[] = [];
    const add = (name: string, kind: Kind, growth: Growth, interval: number | null, extra: Partial<Chore> = {},
        trueInterval?: (at: number) => number) => {
        const factor = 0.6 + random();
        const id = chores.length + 1;
        chores.push({
            id, name, groupKey: null, kind, growth, interval,
            intervalMin: interval === null ? null : interval / 8, intervalMax: interval === null ? null : interval * 4,
            learnStep: 0.15, learnDirection: 0, counterEntity: null, importance: 'normal', deadlineMd: null,
            deadlineAt: null, deadlineLeadDays: 14, conditionId: null, boostId: null, forecastId: null,
            conditionResult: null, boostResult: null, templateError: null, durationMin: pick([5, 10, 15, 30, 45, 60]),
            effort: 1 + Math.floor(random() * 4), seasonFrom: null, seasonTo: null, noisy: false,
            notes: null, lastDoneAt: interval === null ? start : start - random() * interval * DAY, snoozedUntil: null,
            notYetCount: 0, lastNotifiedAt: null, createdAt: start, updatedAt: start, deletedAt: null, personIds: [],
            categoryIds: [], ...extra,
            trueInterval: trueInterval ?? (() => (interval ?? settings.one_time_reference_days) * factor),
        });
    };

    add('Staubsaugen', 'recurring', 'usage', 7, { durationMin: 30, effort: 3 }, (at) => (shedding(at) ? 1 : 7));
    const rooms = ['Küche', 'Bad', 'Flur', 'Wohnzimmer', 'Schlafzimmer', 'Büro'];
    for (const room of rooms) {
        add(`Fußboden wischen ${room}`, 'recurring', 'usage', 14, { groupKey: 'fussboden-wischen', durationMin: 15 });
        add(`Staub wischen ${room}`, 'recurring', 'time', 21, { groupKey: 'staub-wischen', durationMin: 10, effort: 1 });
    }
    const intervals = [2, 7, 7, 14, 14, 14, 30, 30, 30, 60, 60, 90, 90, 180, 180, 365, 365];
    const importances: Importance[] = ['optional', 'normal', 'normal', 'normal', 'important', 'critical'];
    while (chores.length < 110) {
        const interval = pick(intervals);
        add(`Aufgabe ${chores.length + 1}`, 'recurring', random() < 0.6 ? 'usage' : 'time', interval,
            { importance: pick(importances) });
    }
    for (let i = 0; i < 15; i++) {
        const from = pick([3, 4, 5, 9, 11]);
        add(`Saison ${i + 1}`, 'recurring', 'time', pick([7, 14, 30]),
            { seasonFrom: from, seasonTo: ((from + 4) % 12) + 1, noisy: random() < 0.5 });
    }
    for (let i = 0; i < 15; i++) {
        add(`Projekt ${i + 1}`, 'one_time', 'time', null, { importance: 'optional', durationMin: pick([60, 90, 120]) });
    }
    return chores;
}

/**
 * Generates the person states: several short absences per day and a three-week vacation of both persons.
 *
 * @param startDate the first local date
 * @param days the number of days
 */
function generatePresence(startDate: string, days: number): StateRecord[] {
    const records: StateRecord[] = ENTITIES.map((entityId) => ({ entityId, state: 'home', at: startOfDay(startDate, tz) }));
    for (let d = 0; d < days; d++) {
        const date = addDays(startDate, d);
        for (const entityId of ENTITIES) {
            if (date === VACATION_START) {
                records.push({ entityId, state: 'not_home', at: zonedTime(date, '09:00', tz) });
                continue;
            }
            if (date === VACATION_END) {
                records.push({ entityId, state: 'home', at: zonedTime(date, '18:00', tz) });
                continue;
            }
            if (date > VACATION_START && date < VACATION_END) continue;
            const count = 2 + Math.floor(random() * 3);
            for (let i = 0; i < count; i++) {
                const leave = startOfDay(date, tz) + (7 + random() * 13) * 60 * MINUTE;
                records.push({ entityId, state: 'not_home', at: leave });
                records.push({ entityId, state: 'home', at: leave + (20 + random() * 40) * MINUTE });
            }
        }
    }
    return records.sort((a, b) => a.at - b.at);
}

/**
 * Returns the presence of the persons at a moment from the state records.
 *
 * @param records the sorted state records
 * @param at the moment
 */
function presenceAt(records: readonly StateRecord[], at: number): Map<number, PresenceState> {
    const last = new Map<string, StateRecord>();
    for (const r of records) {
        if (r.at > at) break;
        last.set(r.entityId, r);
    }
    return new Map(PERSONS.map((id, i) => {
        const r = last.get(ENTITIES[i]!);
        return [id, { personId: id, home: r?.state === 'home', since: r?.at ?? null, distanceKm: null }];
    }));
}

/** Counters of one month. */
interface MonthStats {
    aboveOne: number;
    aboveTwo: number;
    vacuum: number;
    done: number;
    earlier: number;
    notYet: number;
    noTime: number;
}

/** Runs the simulation and prints the report. */
function run(): void {
    const startDate = `${YEAR}-01-01`;
    const start = startOfDay(startDate, tz);
    const days = 365;
    const chores = generateChores(start);
    const records = generatePresence(startDate, days);
    const occupancy: OccupancyRow[] = buildOccupancy(records);
    const firstRecordAt = records[0]!.at;
    const events: ChoreEvent[] = [];
    const holidays = new Set<string>();
    const months = new Map<number, MonthStats>();
    let afterVacation: ChoreWithNeed[] | null = null;
    let eventId = 1;

    const evaluateAt = (now: number, viewer: PossibleContext['viewer']) => {
        const recent = events.filter((e) => e.type === 'done' && e.at >= now - 2 * DAY);
        const capacities = new Map<number, Capacity>(PERSONS.map((id) =>
            [id, capacityFor(id, now, settings, holidays, [], recent).capacity]));
        const needCtx: NeedContext = { now, settings, occupancy, firstRecordAt, cycles: new Map() };
        const possibleCtx: PossibleContext = { now, settings, viewer, personIds: PERSONS, presence: presenceAt(records, now),
            capacities, holidays };
        return { list: evaluateChores(chores.filter((c) => c.deletedAt === null), needCtx, possibleCtx), possibleCtx };
    };
    const apply = (chore: SimChore, update: Partial<Chore>) => Object.assign(chore, update);
    const stats = (month: number) => {
        let s = months.get(month);
        if (!s) {
            s = { aboveOne: 0, aboveTwo: 0, vacuum: 0, done: 0, earlier: 0, notYet: 0, noTime: 0 };
            months.set(month, s);
        }
        return s;
    };

    for (let d = 0; d < days; d++) {
        const date = addDays(startDate, d);
        const month = Number(date.slice(5, 7));
        const s = stats(month);

        for (const slot of slotsOfDay(date, tz, settings.capacity_slots, holidays)) {
            if (random() >= 0.7) continue;
            const now = slot.start + random() * (slot.end - slot.start) * 0.5;
            const presence = presenceAt(records, now);
            const home = PERSONS.filter((id) => presence.get(id)?.home);
            if (home.length === 0) continue;
            const personId = pick(home);
            const { list } = evaluateAt(now, { kind: 'person', personId });
            const first = selectSuggestions(list, settings)[0];
            if (!first) continue;
            const chore = chores.find((c) => c.id === first.chore.id)!;
            const trueNeed = first.chore.elapsed / chore.trueInterval(now);

            const ctx = { now, need: first.need, elapsed: first.chore.elapsed, personId, oneTimeSnoozeDays:
                settings.one_time_snooze_days, nextSlotAt: nextSlotStart(now, tz, settings.capacity_slots, holidays) };
            if (random() < 0.1) {
                apply(chore, postpone(chore, 'no_time', ctx).update);
                s.noTime++;
            } else if (trueNeed < 0.6 && !first.chore.urgent) {
                apply(chore, postpone(chore, 'not_yet', ctx).update);
                s.notYet++;
            } else {
                const result = done(chore, now, first.need, personId);
                const event = { ...result.event, id: eventId++ };
                events.push(event);
                apply(chore, result.update);
                s.done++;
                if (trueNeed > 1.3) {
                    const e = earlier(chore, event, false, now + 5000, personId, settings.earlier_max_need);
                    if (e && !('error' in e)) {
                        apply(chore, e.update);
                        s.earlier++;
                    }
                }
            }
        }

        const endOfDay = startOfDay(addDays(date, 1), tz) - MINUTE;
        const { list } = evaluateAt(endOfDay, { kind: 'shared' });
        if (date === VACATION_END) afterVacation = list;
        if (addDays(date, 1).slice(5, 7) !== date.slice(5, 7)) {
            s.aboveOne = list.filter((c) => c.need >= 1).length;
            s.aboveTwo = list.filter((c) => c.need >= 2).length;
            s.vacuum = chores[0]!.interval!;
        }
    }

    console.log(`Simulation of ${YEAR} with seed ${SEED}, ${chores.length} chores\n`);
    console.log('Month  need>=1  need>=2  vacuum interval  done  earlier  not_yet  no_time');
    for (const [month, s] of [...months].sort((a, b) => a[0] - b[0])) {
        console.log(`${String(month).padStart(5)}  ${String(s.aboveOne).padStart(7)}  ${String(s.aboveTwo).padStart(7)}  `
            + `${s.vacuum.toFixed(2).padStart(15)}  ${String(s.done).padStart(4)}  ${String(s.earlier).padStart(7)}  `
            + `${String(s.notYet).padStart(7)}  ${String(s.noTime).padStart(7)}`);
    }

    if (afterVacation) {
        const list = afterVacation as ChoreWithNeed[];
        console.log(`\nState after the vacation (${VACATION_END} evening):`);
        for (const growth of ['usage', 'time'] as const) {
            const g = list.filter((c) => c.growth === growth && c.kind === 'recurring');
            console.log(`  ${growth.padEnd(5)}: ${g.filter((c) => c.need >= 1).length} of ${g.length} chores with need >= 1`);
        }
        console.log('  Highest need:');
        for (const c of [...list].sort((a, b) => b.need - a.need).slice(0, 5)) {
            console.log(`    ${c.need.toFixed(2).padStart(6)}  ${c.name} (${c.growth}, interval ${c.interval?.toFixed(1) ?? '-'})`);
        }
    }
}

run();
