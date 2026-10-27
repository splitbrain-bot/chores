/** Kind of a chore. */
export type Kind = 'recurring' | 'one_time';

/** Source of the elapsed value of a chore. */
export type Growth = 'usage' | 'time' | 'counter';

/** Importance of a chore. It sets the slope of the need level after the interval. */
export type Importance = 'optional' | 'normal' | 'important' | 'critical';

/** Rule for the persons who must be at home for a chore. */
export type Assignment = 'any' | 'all';

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

/** Kind of a condition. A state condition has a current result, a forecast condition has a result per forecast day. */
export type ConditionKind = 'state' | 'forecast';

/** A Home Assistant template that many chores can use. */
export interface Condition {
    id: number;
    name: string;
    kind: ConditionKind;
    /** Template source. A forecast condition gets the forecast of one day as the variable day. */
    template: string;
    /** Last result of a state condition: 1, 0 or null for no result or a render error. */
    result: number | null;
    /** Error text of the last rendering. */
    error: string | null;
    /** Name of a Material Design icon. */
    icon: string | null;
}

/** A unit of work with all stored attributes. */
export interface Chore {
    id: number;
    name: string;
    groupKey: string | null;
    kind: Kind;
    growth: Growth;
    /** Days or cycles. Null for one-time tasks. */
    interval: number | null;
    intervalMin: number | null;
    intervalMax: number | null;
    learnStep: number;
    learnDirection: -1 | 0 | 1;
    counterEntity: string | null;
    importance: Importance;
    /** Yearly deadline as MM-DD. */
    deadlineMd: string | null;
    deadlineAt: number | null;
    deadlineLeadDays: number;
    /** State condition that must be true for the chore. */
    conditionId: number | null;
    /** State condition that makes the chore urgent. */
    boostId: number | null;
    /** Forecast condition for the look-ahead. */
    forecastId: number | null;
    /** Current result of the condition: 1, 0 or null for no result or a render error. */
    conditionResult: number | null;
    /** Current result of the boost condition. */
    boostResult: number | null;
    /** Error text of the condition or of the boost condition. */
    templateError: string | null;
    durationMin: number;
    effort: number;
    assignment: Assignment;
    seasonFrom: number | null;
    seasonTo: number | null;
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
    | { code: 'interval'; interval: number; elapsed: number; unit: 'days' | 'cycles' }
    | { code: 'deadline'; deadline: number; overdueDays: number }
    | { code: 'boost' }
    | { code: 'one_time'; ageDays: number };

/** A chore with its computed need level and filter result. */
export interface ChoreWithNeed extends Chore {
    need: number;
    elapsed: number;
    elapsedUnit: 'days' | 'cycles';
    /** True when an active deadline or boost raises the need level. */
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
    'slope.optional': number;
    'slope.normal': number;
    'slope.important': number;
    'slope.critical': number;
    one_time_reference_days: number;
    handover_after_hours: number;
    handover_distance_km: number;
    suggest_threshold: number;
    also_threshold: number;
    suggestion_count: number;
    capacity_slots: Slot[];
    hangover_effort: number;
    earlier_window_seconds: number;
    /** Highest need level of a done event that still allows the tap "necessary earlier". */
    earlier_max_need: number;
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
    'slope.optional': 0.3,
    'slope.normal': 1,
    'slope.important': 2,
    'slope.critical': 4,
    one_time_reference_days: 30,
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
    earlier_window_seconds: 10,
    earlier_max_need: 1.5,
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
