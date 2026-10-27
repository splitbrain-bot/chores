import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

/** Table person. */
export interface PersonTable {
    id: Generated<number>;
    name: string;
    haEntity: string | null;
    haDistanceEntity: string | null;
    haCalendarEntity: string | null;
    haNotifyAction: string | null;
    passwordHash: string | null;
    sort: Generated<number>;
    color: Generated<string>;
}

/** Table category. */
export interface CategoryTable {
    id: Generated<number>;
    name: string;
    sort: Generated<number>;
    icon: string | null;
}

/** Table condition. */
export interface ConditionTable {
    id: Generated<number>;
    name: string;
    kind: 'state' | 'forecast';
    template: string;
    result: number | null;
    error: string | null;
    icon: string | null;
}

/** Table chore. */
export interface ChoreTable {
    id: Generated<number>;
    name: string;
    groupKey: string | null;
    kind: 'recurring' | 'one_time';
    growth: 'usage' | 'time' | 'counter';
    interval: number | null;
    intervalMin: number | null;
    intervalMax: number | null;
    learnStep: Generated<number>;
    learnDirection: Generated<number>;
    counterEntity: string | null;
    importance: 'optional' | 'normal' | 'important' | 'critical';
    deadlineMd: string | null;
    deadlineAt: number | null;
    deadlineLeadDays: Generated<number>;
    conditionId: number | null;
    boostId: number | null;
    forecastId: number | null;
    durationMin: number;
    effort: number;
    assignment: 'any' | 'all';
    seasonFrom: number | null;
    seasonTo: number | null;
    noisy: Generated<number>;
    notes: string | null;
    lastDoneAt: number;
    snoozedUntil: number | null;
    notYetCount: Generated<number>;
    lastNotifiedAt: number | null;
    createdAt: number;
    updatedAt: number;
    deletedAt: number | null;
}

/** Table chore_category. */
export interface ChoreCategoryTable {
    choreId: number;
    categoryId: number;
}

/** Table chore_person. */
export interface ChorePersonTable {
    choreId: number;
    personId: number;
}

/** Table event. */
export interface EventTable {
    id: Generated<number>;
    choreId: number;
    type: 'done' | 'earlier' | 'postpone';
    reason: 'no_time' | 'no_energy' | 'not_yet' | null;
    at: number;
    personId: number | null;
    needLevel: number;
    intervalBefore: number | null;
    intervalAfter: number | null;
    effort: number;
}

/** Table ha_state. */
export interface HaStateTable {
    id: Generated<number>;
    entityId: string;
    state: string;
    at: number;
}

/** Table occupancy. */
export interface OccupancyTable {
    id: Generated<number>;
    startAt: number;
    endAt: number | null;
    clockStart: number;
}

/** Table token. */
export interface TokenTable {
    id: Generated<number>;
    kind: 'person' | 'shared' | 'mcp';
    personId: number | null;
    label: string;
    tokenHash: string;
    createdAt: number;
    lastUsedAt: number | null;
    revokedAt: number | null;
}

/** Table setting. */
export interface SettingTable {
    key: string;
    value: string;
}

/** Table cache. */
export interface CacheTable {
    key: string;
    value: string;
    fetchedAt: number;
}

/** All tables with the camel case names of the CamelCasePlugin. */
export interface DB {
    person: PersonTable;
    category: CategoryTable;
    condition: ConditionTable;
    chore: ChoreTable;
    choreCategory: ChoreCategoryTable;
    chorePerson: ChorePersonTable;
    event: EventTable;
    haState: HaStateTable;
    occupancy: OccupancyTable;
    token: TokenTable;
    setting: SettingTable;
    cache: CacheTable;
}

/** A selected chore row. */
export type ChoreRow = Selectable<ChoreTable>;

/** A chore row for an insert. */
export type NewChoreRow = Insertable<ChoreTable>;

/** A chore row for an update. */
export type ChoreRowUpdate = Updateable<ChoreTable>;

/** A selected condition row. */
export type ConditionRow = Selectable<ConditionTable>;

/** A selected person row. */
export type PersonRow = Selectable<PersonTable>;

/** A selected token row. */
export type TokenRow = Selectable<TokenTable>;
