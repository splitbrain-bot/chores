/** Kind of a chore. */
export type Kind = 'recurring' | 'one_time';

/** Reason of a postpone. */
export type PostponeReason = 'no_time' | 'no_energy' | 'not_yet';

/** Type of a chore event. */
export type EventType = 'done' | 'earlier' | 'postpone';

/** A member of the household. */
export interface Person {
    id: number;
    name: string;
    /** Person entity of Home Assistant. A person without it counts as always at home. */
    haEntity: string | null;
    distanceEntity: string | null;
    calendarEntity: string | null;
    notifyAction: string | null;
    sort: number;
    /** Color of the person as #rrggbb. */
    color: string;
}

/** A label for chores, for example a room. */
export interface Category {
    id: number;
    name: string;
    sort: number;
    /** Name of a Material Design icon. */
    icon: string | null;
}

/** A Home Assistant template that many chores can use. */
export interface Condition {
    id: number;
    name: string;
    /** Template source for the current state. */
    template: string;
    /** Template source for one forecast day, with the forecast of the day as the variable day. Null without a forecast. */
    forecastTemplate: string | null;
    /** Last result of the template: 1, 0 or null for no result or a render error. */
    result: number | null;
    /** Error text of the last rendering. */
    error: string | null;
    /** Time at which the result last changed to 1, null when it never did. */
    sinceAt: number | null;
    /** Name of a Material Design icon. */
    icon: string | null;
}

/** A unit of work with all stored attributes. */
export interface Chore {
    id: number;
    name: string;
    kind: Kind;
    /** Days. Null for one-time tasks. */
    interval: number | null;
    /** True when the elapsed time counts only while a person is at home. */
    pausesWhenAway: boolean;
    /** Yearly deadline as MM-DD, for recurring chores. */
    deadlineMd: string | null;
    /** Fixed deadline, for one-time tasks. */
    deadlineAt: number | null;
    /** Condition that must be true for the chore. */
    requiresId: number | null;
    /** Condition that makes the chore urgent when it becomes true. */
    triggerId: number | null;
    /** Current result of the required condition: 1, 0 or null for no result or a render error. */
    requiresResult: number | null;
    /** Current result of the trigger condition. */
    triggerResult: number | null;
    /** Time at which the trigger condition last became true. */
    triggerSinceAt: number | null;
    /** Error text of the required condition or of the trigger condition. */
    templateError: string | null;
    durationMin: number;
    effort: number;
    /** Months of the season, 1 is January. Empty means the whole year. */
    seasonMonths: number[];
    noisy: boolean;
    notes: string | null;
    lastDoneAt: number;
    snoozedUntil: number | null;
    notYetCount: number;
    lastNotifiedAt: number | null;
    createdAt: number;
    updatedAt: number;
    deletedAt: number | null;
    /** Candidate persons. An empty list means every person. */
    personIds: number[];
    categoryIds: number[];
}

/** One user action on a chore. */
export interface ChoreEvent {
    id: number;
    choreId: number;
    type: EventType;
    reason: PostponeReason | null;
    at: number;
    personId: number | null;
    needLevel: number;
    intervalBefore: number | null;
    intervalAfter: number | null;
    durationMin: number;
    effort: number;
}

/** A period in which at least one person is at home. */
export interface OccupancyRow {
    startAt: number;
    endAt: number | null;
    /** Value of the presence clock at startAt in milliseconds. */
    clockStart: number;
}

/** One recorded state of a Home Assistant entity. */
export interface StateRecord {
    entityId: string;
    state: string;
    at: number;
}

/** Presence of one person. */
export interface PresenceState {
    personId: number;
    home: boolean;
    /** Time of the last change between home and away, null when unknown. */
    since: number | null;
    /** Distance from home in km, null when the sensor has no valid value. */
    distanceKm: number | null;
}

/** The person or the shared device that asks for suggestions. */
export type Viewer = { kind: 'person'; personId: number } | { kind: 'shared' };

/** Available time and energy of one person at one moment. */
export interface Capacity {
    minutes: number;
    energy: number;
}

/** A capacity slot for some weekdays. The times are local HH:MM. */
export interface Slot {
    /** Weekdays of the slot, 0 is Sunday. Public holidays use the slots of Sunday. */
    days: number[];
    from: string;
    to: string;
    minutes: number;
    energy: number;
}

/** A calendar event with UTC timestamps. */
export interface CalendarEvent {
    start: number;
    end: number;
    summary: string;
    allDay: boolean;
}

/** One entry of the daily weather forecast. */
export interface ForecastDay {
    datetime: string;
    condition?: string;
    temperature?: number;
    templow?: number;
    precipitation?: number;
    precipitation_probability?: number;
    wind_speed?: number;
    [key: string]: unknown;
}

/** Code for a filter that blocks a chore. */
export type BlockCode = 'deleted' | 'snoozed' | 'season' | 'quiet_day' | 'condition' | 'persons'
    | 'capacity' | 'need';

/** Explanation of the need level for the UI. */
export type Reason =
    | { code: 'interval'; interval: number; elapsed: number }
    | { code: 'deadline'; deadline: number; overdueDays: number }
    | { code: 'trigger' }
    | { code: 'one_time'; ageDays: number };

/** A chore with its computed need level and filter result. */
export interface ChoreWithNeed extends Chore {
    need: number;
    /** Elapsed days since the last done event, or the age of a one-time task. */
    elapsed: number;
    /** True when an active deadline or trigger raises the need level. */
    urgent: boolean;
    possible: boolean;
    blockedBy: BlockCode[];
    reason: Reason;
}

/** One suggestion with its main chore and the chores of the same group. */
export interface Suggestion {
    chore: ChoreWithNeed;
    also: ChoreWithNeed[];
    need: number;
    reason: Reason;
}

/** Reason of a look-ahead hint. */
export type HintReason =
    | { code: 'weather'; condition: string | null; temperature: number | null; precipitation: number | null }
    | { code: 'quiet_day' }
    | { code: 'all_free' }
    | { code: 'free_time'; minutes: number };

/** A hint for a good day for a chore. */
export interface Hint {
    choreId: number;
    choreName: string;
    /** Local date YYYY-MM-DD. */
    date: string;
    reasons: HintReason[];
}

/** All tuning values. */
export interface Settings {
    time_zone: string;
    one_time_reference_days: number;
    /** Days before a deadline in which the chore is urgent. */
    deadline_lead_days: number;
    /** Lowest need level at which a trigger can make a chore urgent. */
    trigger_min_need: number;
    /** Distance of the learning target from the observed elapsed time, as a part of it. */
    learn_margin: number;
    /** Part of the distance to the target that one signal applies. */
    learn_rate: number;
    handover_after_hours: number;
    handover_distance_km: number;
    suggest_threshold: number;
    also_threshold: number;
    suggestion_count: number;
    capacity_slots: Slot[];
    hangover_effort: number;
    one_time_snooze_days: number;
    lookahead_days: number;
    notify_hour: number;
    notify_lookahead: boolean;
    holiday_calendar: string;
    holiday_state: string;
    weather_entity: string;
    forecast_refresh_minutes: number;
    calendar_refresh_minutes: number;
    ha_frame_ancestors: string[];
}

/** Default values of all settings. */
export const DEFAULT_SETTINGS: Settings = {
    time_zone: 'Europe/Berlin',
    one_time_reference_days: 30,
    deadline_lead_days: 14,
    trigger_min_need: 0.5,
    learn_margin: 0.25,
    learn_rate: 0.5,
    handover_after_hours: 24,
    handover_distance_km: 30,
    suggest_threshold: 0.9,
    also_threshold: 0.75,
    suggestion_count: 3,
    capacity_slots: [
        { days: [1, 2, 3, 4], from: '06:00', to: '08:00', minutes: 10, energy: 2 },
        { days: [1, 2, 3, 4], from: '08:00', to: '17:00', minutes: 10, energy: 2 },
        { days: [1, 2, 3, 4], from: '17:00', to: '21:30', minutes: 45, energy: 3 },
        { days: [5, 6, 0], from: '08:00', to: '12:00', minutes: 120, energy: 5 },
        { days: [5, 6, 0], from: '12:00', to: '18:00', minutes: 120, energy: 4 },
        { days: [5, 6, 0], from: '18:00', to: '21:30', minutes: 45, energy: 3 },
    ],
    hangover_effort: 4,
    one_time_snooze_days: 7,
    lookahead_days: 7,
    notify_hour: 9,
    notify_lookahead: true,
    holiday_calendar: 'calendar.holidays_in_germany',
    holiday_state: 'Berlin',
    weather_entity: 'weather.home',
    forecast_refresh_minutes: 60,
    calendar_refresh_minutes: 15,
    ha_frame_ancestors: [],
};

/** Milliseconds per minute. */
export const MINUTE = 60_000;

/** Milliseconds per hour. */
export const HOUR = 3_600_000;

/** Milliseconds per day. */
export const DAY = 86_400_000;
