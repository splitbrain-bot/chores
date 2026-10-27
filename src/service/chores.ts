import type { ChoreEvent, ChoreWithNeed, Kind } from '../core/types.ts';
import { listCategories } from '../db/categories.ts';
import { listConditions } from '../db/conditions.ts';
import { createChore as insertChore, getChore as loadChore, updateChore as storeChore, type NewChore } from '../db/chores.ts';
import { listChoreEvents } from '../db/events.ts';
import { listPersons } from '../db/persons.ts';
import type { ChoreInput, ChoreUpdate } from '../schemas/chore.ts';
import type { Deps } from './deps.ts';
import { notFound, ServiceError } from './errors.ts';
import { evaluate } from './evaluate.ts';
import { evaluatedChore } from './feedback.ts';

/** Filter of the chore list. */
export interface ChoreQuery {
    q?: string;
    categoryId?: number;
    kind?: Kind;
    minNeed?: number;
    includeDeleted?: boolean;
}

/**
 * Checks the combined values of a chore.
 *
 * @param c the values
 * @throws ServiceError for an invalid combination
 */
function check(c: Omit<NewChore, 'createdAt' | 'updatedAt'>): void {
    if (c.kind === 'recurring' && !c.interval) throw new ServiceError(400, 'A recurring chore needs an interval');
    if (c.growth === 'counter' && !c.counterEntity) throw new ServiceError(400, 'A counter chore needs a counter entity');
    if ((c.seasonFrom === null) !== (c.seasonTo === null)) throw new ServiceError(400, 'A season needs a start and an end');
    if (c.intervalMin !== null && c.intervalMax !== null && c.intervalMin > c.intervalMax) {
        throw new ServiceError(400, 'The minimum interval is larger than the maximum interval');
    }
}

/**
 * Checks that the linked persons and categories exist.
 *
 * @param deps the dependencies
 * @param personIds the person ids
 * @param categoryIds the category ids
 * @throws ServiceError for an unknown id
 */
async function checkLinks(deps: Deps, personIds: readonly number[], categoryIds: readonly number[]): Promise<void> {
    const persons = new Set((await listPersons(deps.db)).map((p) => p.id));
    const categories = new Set((await listCategories(deps.db)).map((c) => c.id));
    if (personIds.some((id) => !persons.has(id))) throw new ServiceError(400, 'Unknown person');
    if (categoryIds.some((id) => !categories.has(id))) throw new ServiceError(400, 'Unknown category');
}

/**
 * Checks that the linked conditions exist and have the right kind.
 *
 * @param deps the dependencies
 * @param c the values
 * @throws ServiceError for an unknown condition or a wrong kind
 */
async function checkConditions(deps: Deps, c: NewChore): Promise<void> {
    const kinds = new Map((await listConditions(deps.db)).map((cond) => [cond.id, cond.kind]));
    for (const [id, kind] of [[c.conditionId, 'state'], [c.boostId, 'state'], [c.forecastId, 'forecast']] as const) {
        if (id === null) continue;
        if (!kinds.has(id)) throw new ServiceError(400, 'Unknown condition');
        if (kinds.get(id) !== kind) throw new ServiceError(400, `The condition ${id} is not a ${kind} condition`);
    }
}

/**
 * Applies input values to chore values. The interval limits of a recurring chore default to an eighth and four times
 * the interval when they are empty or when the input sets the interval without them.
 *
 * @param base the current values
 * @param input the input values
 */
function merge(base: NewChore, input: ChoreUpdate): NewChore {
    const next: NewChore = { ...base };
    for (const [key, value] of Object.entries(input)) {
        if (value !== undefined) (next as unknown as Record<string, unknown>)[key] = value;
    }
    if (next.kind === 'one_time') {
        next.interval = null;
        next.intervalMin = null;
        next.intervalMax = null;
    } else if (next.interval) {
        if (next.intervalMin == null || (input.interval && input.intervalMin === undefined)) next.intervalMin = next.interval / 8;
        if (next.intervalMax == null || (input.interval && input.intervalMax === undefined)) next.intervalMax = next.interval * 4;
    }
    for (const key of ['groupKey', 'intervalMin', 'intervalMax', 'counterEntity', 'deadlineMd', 'deadlineAt',
        'conditionId', 'boostId', 'forecastId', 'seasonFrom', 'seasonTo', 'notes'] as const) {
        if (next[key] === undefined) (next as unknown as Record<string, unknown>)[key] = null;
    }
    return next;
}

/**
 * Creates a chore.
 *
 * @param deps the dependencies
 * @param input the validated input
 */
export async function createChore(deps: Deps, input: ChoreInput): Promise<ChoreWithNeed> {
    const now = deps.now();
    const empty: NewChore = {
        name: '', groupKey: null, kind: 'recurring', growth: 'time', interval: null, intervalMin: null,
        intervalMax: null, learnStep: 0.15, learnDirection: 0, counterEntity: null, importance: 'normal',
        deadlineMd: null, deadlineAt: null, deadlineLeadDays: 14, conditionId: null, boostId: null,
        forecastId: null, conditionResult: null, boostResult: null, templateError: null, durationMin: 10,
        effort: 1, seasonFrom: null, seasonTo: null, noisy: false, notes: null, lastDoneAt: now,
        snoozedUntil: null, notYetCount: 0, lastNotifiedAt: null, createdAt: now, updatedAt: now, deletedAt: null,
        personIds: [], categoryIds: [],
    };
    const values = merge(empty, input);
    if (values.kind === 'one_time') values.lastDoneAt = now;
    check(values);
    await checkLinks(deps, values.personIds, values.categoryIds);
    await checkConditions(deps, values);
    const chore = await insertChore(deps.db, values);
    deps.onChoresChanged?.();
    return evaluatedChore(deps, { kind: 'shared' }, chore.id);
}

/**
 * Changes a chore.
 *
 * @param deps the dependencies
 * @param id the chore id
 * @param input the validated changes
 */
export async function updateChore(deps: Deps, id: number, input: ChoreUpdate): Promise<ChoreWithNeed> {
    const current = await loadChore(deps.db, id);
    if (!current || current.deletedAt !== null) throw notFound('Chore');
    const { id: _id, ...base } = current;
    const values = merge(base, input);
    check(values);
    await checkLinks(deps, values.personIds, values.categoryIds);
    await checkConditions(deps, values);
    await storeChore(deps.db, id, { ...values, updatedAt: deps.now() });
    deps.onChoresChanged?.();
    return evaluatedChore(deps, { kind: 'shared' }, id);
}

/**
 * Deletes a chore. The chore stays in the database with a deletion time.
 *
 * @param deps the dependencies
 * @param id the chore id
 */
export async function deleteChore(deps: Deps, id: number): Promise<void> {
    const current = await loadChore(deps.db, id);
    if (!current || current.deletedAt !== null) throw notFound('Chore');
    await storeChore(deps.db, id, { deletedAt: deps.now(), updatedAt: deps.now() });
    deps.onChoresChanged?.();
}

/**
 * Lists the chores with their need levels. The filters apply to the whole household, so a chore is possible when one
 * of its persons can do it.
 *
 * @param deps the dependencies
 * @param query the filter
 */
export async function listChores(deps: Deps, query: ChoreQuery = {}): Promise<ChoreWithNeed[]> {
    const { chores } = await evaluate(deps, { kind: 'shared' }, { includeDeleted: query.includeDeleted });
    const q = query.q?.trim().toLocaleLowerCase();
    return chores.filter((c) => (!q || c.name.toLocaleLowerCase().includes(q))
        && (query.categoryId === undefined || c.categoryIds.includes(query.categoryId))
        && (query.kind === undefined || c.kind === query.kind)
        && (query.minNeed === undefined || c.need >= query.minNeed));
}

/**
 * Returns one chore with its latest events. The filters apply to the whole household.
 *
 * @param deps the dependencies
 * @param id the chore id
 * @param eventLimit the number of events
 */
export async function getChore(deps: Deps, id: number, eventLimit = 20):
    Promise<{ chore: ChoreWithNeed; events: ChoreEvent[] }> {
    const chore = await evaluatedChore(deps, { kind: 'shared' }, id, true);
    return { chore, events: await listChoreEvents(deps.db, id, eventLimit) };
}
