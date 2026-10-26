import type { Chore, ChoreEvent, ChoreWithNeed, Kind, Viewer } from '../core/types.ts';
import { listCategories } from '../db/categories.ts';
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
 * Applies input values to chore values. Interval limits default to a quarter and four times the interval when the
 * interval is set without them.
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
    } else if (input.interval) {
        if (input.intervalMin === undefined) next.intervalMin = input.interval / 4;
        if (input.intervalMax === undefined) next.intervalMax = input.interval * 4;
    }
    for (const key of ['groupKey', 'intervalMin', 'intervalMax', 'counterEntity', 'deadlineMd', 'deadlineAt',
        'conditionTemplate', 'boostTemplate', 'forecastTemplate', 'seasonFrom', 'seasonTo', 'notes'] as const) {
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
        deadlineMd: null, deadlineAt: null, deadlineLeadDays: 14, conditionTemplate: null, boostTemplate: null,
        forecastTemplate: null, conditionResult: null, boostResult: null, templateError: null, durationMin: 10,
        effort: 1, assignment: 'any', seasonFrom: null, seasonTo: null, noisy: false, notes: null, lastDoneAt: now,
        snoozedUntil: null, notYetCount: 0, lastNotifiedAt: null, createdAt: now, updatedAt: now, deletedAt: null,
        personIds: [], categoryIds: [],
    };
    const values = merge(empty, input);
    if (values.kind === 'one_time') values.lastDoneAt = now;
    check(values);
    await checkLinks(deps, values.personIds, values.categoryIds);
    const chore = await insertChore(deps.db, values);
    deps.onChoresChanged?.();
    return evaluatedChore(deps, { kind: 'shared' }, chore.id);
}

/**
 * Changes a chore. A changed template clears its last result.
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
    const update: Partial<Chore> = { ...values, updatedAt: deps.now() };
    if (values.conditionTemplate !== current.conditionTemplate) update.conditionResult = null;
    if (values.boostTemplate !== current.boostTemplate) update.boostResult = null;
    if (values.conditionTemplate !== current.conditionTemplate || values.boostTemplate !== current.boostTemplate) {
        update.templateError = null;
    }
    await storeChore(deps.db, id, update);
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
 * Lists the chores with their need levels.
 *
 * @param deps the dependencies
 * @param viewer the viewer
 * @param query the filter
 */
export async function listChores(deps: Deps, viewer: Viewer, query: ChoreQuery = {}): Promise<ChoreWithNeed[]> {
    const { chores } = await evaluate(deps, viewer, { includeDeleted: query.includeDeleted });
    const q = query.q?.trim().toLocaleLowerCase();
    return chores.filter((c) => (!q || c.name.toLocaleLowerCase().includes(q))
        && (query.categoryId === undefined || c.categoryIds.includes(query.categoryId))
        && (query.kind === undefined || c.kind === query.kind)
        && (query.minNeed === undefined || c.need >= query.minNeed));
}

/**
 * Returns one chore with its latest events.
 *
 * @param deps the dependencies
 * @param viewer the viewer
 * @param id the chore id
 * @param eventLimit the number of events
 */
export async function getChore(deps: Deps, viewer: Viewer, id: number, eventLimit = 20):
    Promise<{ chore: ChoreWithNeed; events: ChoreEvent[] }> {
    const chore = await evaluatedChore(deps, viewer, id, true);
    return { chore, events: await listChoreEvents(deps.db, id, eventLimit) };
}
