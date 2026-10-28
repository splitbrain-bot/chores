import { publicHolidays } from '../core/holidays.ts';
import { DEADLINE_LEVEL } from '../core/need.ts';
import { candidates } from '../core/possible.ts';
import { addDays, localDate, localParts } from '../core/time.ts';
import { DAY, HOUR, MINUTE, type ChoreWithNeed, type Hint, type Person, type Settings } from '../core/types.ts';
import { deleteCache, getCache, setCache } from '../db/cache.ts';
import { updateChore } from '../db/chores.ts';
import { listPersons } from '../db/persons.ts';
import { getSettings } from '../db/settings.ts';
import { getRawEvents, toCalendarEvents } from '../ha/calendar.ts';
import type { HaApi } from '../ha/connection.ts';
import { getDailyForecast } from '../ha/forecast.ts';
import { notify } from '../ha/notify.ts';
import type { Deps } from '../service/deps.ts';
import { calendarKey, evaluate, FORECAST_KEY, HOLIDAYS_KEY } from '../service/evaluate.ts';
import { FORECAST_TEMPLATE_PREFIX, getLookahead } from '../service/lookahead.ts';

/** Days of the holiday calendar that the holiday job reads. */
const HOLIDAY_DAYS = 400;

/** Title of all notifications. */
const TITLE = 'Chores';

/** A job with the function that returns its interval. */
interface Job {
    name: string;
    run: () => Promise<void>;
    interval: (settings: Settings) => number;
}

/** Runs the jobs for the forecast, the calendars, the holidays and the notifications. */
export class Scheduler {
    private readonly deps: Deps & { ha: HaApi };
    private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
    private stopped = false;

    /**
     * @param deps the dependencies with a Home Assistant connection
     */
    constructor(deps: Deps & { ha: HaApi }) {
        this.deps = deps;
    }

    /** All jobs. */
    private get jobs(): Job[] {
        return [
            { name: 'forecast', run: () => this.refreshForecast(), interval: (s) => s.forecast_refresh_minutes * MINUTE },
            { name: 'calendars', run: () => this.refreshCalendars(), interval: (s) => s.calendar_refresh_minutes * MINUTE },
            { name: 'holidays', run: () => this.refreshHolidays(), interval: () => DAY },
            { name: 'notifications', run: () => this.sendNotifications(), interval: () => HOUR },
        ];
    }

    /** Runs every job once and then in its interval. */
    start(): void {
        this.stopped = false;
        for (const job of this.jobs) void this.tick(job);
    }

    /** Stops all timers. */
    stop(): void {
        this.stopped = true;
        for (const timer of this.timers.values()) clearTimeout(timer);
        this.timers.clear();
    }

    /**
     * Runs a job and schedules the next run with the current interval setting.
     *
     * @param job the job
     */
    private async tick(job: Job): Promise<void> {
        try {
            await job.run();
        } catch (err) {
            console.error(`Job ${job.name} failed`, err);
        }
        if (this.stopped) return;
        const settings = await getSettings(this.deps.db);
        this.timers.set(job.name, setTimeout(() => void this.tick(job), job.interval(settings)));
    }

    /** Reads the daily forecast and clears the cached forecast condition results. */
    async refreshForecast(): Promise<void> {
        const { db, ha } = this.deps;
        const settings = await getSettings(db);
        const forecast = await getDailyForecast(ha, settings.weather_entity);
        await setCache(db, FORECAST_KEY, forecast, this.deps.now());
        await deleteCache(db, FORECAST_TEMPLATE_PREFIX);
    }

    /** Reads the events of the calendar of every person. */
    async refreshCalendars(): Promise<void> {
        const { db, ha } = this.deps;
        const settings = await getSettings(db);
        const now = this.deps.now();
        const end = now + (settings.lookahead_days + 1) * DAY;
        for (const person of await listPersons(db)) {
            if (!person.calendarEntity) continue;
            const raw = await getRawEvents(ha, person.calendarEntity, now, end);
            await setCache(db, calendarKey(person.calendarEntity), toCalendarEvents(raw, settings.time_zone), now);
        }
    }

    /** Reads the public holidays of the next 400 days. */
    async refreshHolidays(): Promise<void> {
        const { db, ha } = this.deps;
        const settings = await getSettings(db);
        const now = this.deps.now();
        const raw = await getRawEvents(ha, settings.holiday_calendar, now, now + HOLIDAY_DAYS * DAY);
        const events = raw.map((e) => ({
            start: /^\d{4}-\d{2}-\d{2}$/.test(e.start) ? e.start : localDate(Date.parse(e.start), settings.time_zone),
            summary: e.summary ?? '',
            description: e.description ?? null,
        }));
        await setCache(db, HOLIDAYS_KEY, publicHolidays(events, settings.holiday_state), now);
    }

    /** Sends the deadline and trigger messages and on Thursday the look-ahead for the weekend, at the notify hour. */
    async sendNotifications(): Promise<void> {
        const { db } = this.deps;
        const settings = await getSettings(db);
        const now = this.deps.now();
        const local = localParts(now, settings.time_zone);
        if (local.hour !== settings.notify_hour) return;

        const persons = await listPersons(db);
        const { chores } = await evaluate(this.deps, { kind: 'shared' });
        for (const chore of chores) {
            if (!chore.urgent || chore.need < DEADLINE_LEVEL) continue;
            if (chore.lastNotifiedAt !== null && localDate(chore.lastNotifiedAt, settings.time_zone) === local.date) continue;
            const message = urgentMessage(chore, settings);
            for (const person of recipients(chore, persons)) {
                await notify(this.deps.ha, person.notifyAction!, TITLE, message);
            }
            await updateChore(db, chore.id, { lastNotifiedAt: now });
        }

        if (local.weekday === 4 && settings.notify_lookahead) await this.sendWeekendHints(persons, chores, local.date);
    }

    /**
     * Sends each person the look-ahead hints for Friday, Saturday and Sunday, once per Thursday.
     *
     * @param persons all persons
     * @param chores the evaluated chores
     * @param today the local date of the Thursday
     */
    private async sendWeekendHints(persons: Person[], chores: ChoreWithNeed[], today: string): Promise<void> {
        const key = `notify:lookahead:${today}`;
        if (await getCache(this.deps.db, key)) return;
        const weekend = new Set([1, 2, 3].map((n) => addDays(today, n)));
        const { hints } = await getLookahead(this.deps);
        const byChore = new Map(chores.map((c) => [c.id, c]));

        for (const person of persons) {
            if (!person.notifyAction) continue;
            const mine = hints.filter((h) => weekend.has(h.date)
                && candidates(byChore.get(h.choreId)!, persons.map((p) => p.id)).includes(person.id));
            if (mine.length > 0) await notify(this.deps.ha, person.notifyAction, TITLE, mine.map(hintLine).join('\n'));
        }
        await setCache(this.deps.db, key, true, this.deps.now());
    }
}

/**
 * Returns the persons with a notify action who are candidates of a chore.
 *
 * @param chore the chore
 * @param persons all persons
 */
function recipients(chore: ChoreWithNeed, persons: Person[]): Person[] {
    const ids = candidates(chore, persons.map((p) => p.id));
    return persons.filter((p) => ids.includes(p.id) && p.notifyAction);
}

/**
 * Formats a local date as DD.MM.
 *
 * @param ts milliseconds since the epoch
 * @param timeZone IANA time zone
 */
function dayMonth(ts: number, timeZone: string): string {
    const p = localParts(ts, timeZone);
    return `${String(p.day).padStart(2, '0')}.${String(p.month).padStart(2, '0')}.`;
}

/**
 * Builds the message for a chore with an active deadline or trigger.
 *
 * @param chore the chore
 * @param settings the settings
 */
export function urgentMessage(chore: ChoreWithNeed, settings: Settings): string {
    if (chore.reason.code !== 'deadline') return `Now: ${chore.name}`;
    // the deadline is the start of the day after the due date
    const due = dayMonth(chore.reason.deadline - 1, settings.time_zone);
    return chore.reason.overdueDays > 0 ? `Overdue since ${due}: ${chore.name}` : `Due by ${due}: ${chore.name}`;
}

/**
 * Formats one look-ahead hint as a line with the weekday.
 *
 * @param hint the hint
 */
export function hintLine(hint: Hint): string {
    const weekday = new Date(`${hint.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
    const weather = hint.reasons.find((r) => r.code === 'weather');
    const details = weather && weather.code === 'weather'
        ? [weather.condition, weather.temperature !== null ? `${weather.temperature} °C` : null].filter(Boolean).join(', ')
        : '';
    return `${weekday}: ${hint.choreName}${details ? ` (${details})` : ''}`;
}
