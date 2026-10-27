import type { Condition } from '../core/types.ts';
import { deleteCache } from '../db/cache.ts';
import * as conditions from '../db/conditions.ts';
import { getSettings } from '../db/settings.ts';
import type { ConditionInput, ConditionUpdate } from '../schemas/condition.ts';
import { isUniqueError } from './admin.ts';
import type { Deps } from './deps.ts';
import { notFound, ServiceError } from './errors.ts';
import { FORECAST_TEMPLATE_PREFIX, forecastResults, loadForecast } from './lookahead.ts';

/** A condition with its current status. */
export interface ConditionStatus extends Condition {
    /** Active chores that use the condition. */
    choreIds: number[];
    /** Results of a forecast condition per local date of the look-ahead, empty for a state condition. */
    forecast: { date: string; result: boolean | null }[];
}

/**
 * Adds the chores and the forecast results to conditions.
 *
 * @param deps the dependencies
 * @param list the conditions
 */
async function withStatus(deps: Deps, list: readonly Condition[]): Promise<ConditionStatus[]> {
    const uses = await conditions.conditionUses(deps.db);
    const settings = await getSettings(deps.db);
    const forecast = await loadForecast(deps, settings.time_zone);
    const results = await forecastResults(deps, list.filter((c) => c.kind === 'forecast'), forecast.days, deps.now(),
        settings);
    return list.map((c) => ({
        ...c,
        choreIds: uses.get(c.id) ?? [],
        forecast: [...(results.get(c.id) ?? [])].map(([date, result]) => ({ date, result })),
    }));
}

/**
 * Returns one condition with its status.
 *
 * @param deps the dependencies
 * @param id the condition id
 * @throws ServiceError when the condition does not exist
 */
async function statusOf(deps: Deps, id: number): Promise<ConditionStatus> {
    const condition = await conditions.getCondition(deps.db, id);
    if (!condition) throw notFound('Condition');
    return (await withStatus(deps, [condition]))[0]!;
}

/**
 * Lists the conditions with their status.
 *
 * @param deps the dependencies
 */
export async function listConditions(deps: Deps): Promise<ConditionStatus[]> {
    return withStatus(deps, await conditions.listConditions(deps.db));
}

/**
 * Creates a condition.
 *
 * @param deps the dependencies
 * @param input the validated input
 */
export async function createCondition(deps: Deps, input: ConditionInput): Promise<ConditionStatus> {
    let condition: Condition;
    try {
        condition = await conditions.createCondition(deps.db, input);
    } catch (err) {
        if (isUniqueError(err)) throw new ServiceError(409, 'The name exists already');
        throw err;
    }
    deps.onConditionsChanged?.();
    return statusOf(deps, condition.id);
}

/**
 * Changes a condition. A changed template clears the last result and the cached forecast results.
 *
 * @param deps the dependencies
 * @param id the condition id
 * @param input the validated changes
 */
export async function updateCondition(deps: Deps, id: number, input: ConditionUpdate): Promise<ConditionStatus> {
    try {
        if (!(await conditions.updateCondition(deps.db, id, input))) throw notFound('Condition');
    } catch (err) {
        if (isUniqueError(err)) throw new ServiceError(409, 'The name exists already');
        throw err;
    }
    if (input.template !== undefined) await deleteCache(deps.db, `${FORECAST_TEMPLATE_PREFIX}${id}:`);
    deps.onConditionsChanged?.();
    return statusOf(deps, id);
}

/**
 * Deletes a condition that no active chore uses.
 *
 * @param deps the dependencies
 * @param id the condition id
 * @throws ServiceError when the condition does not exist or chores use it
 */
export async function deleteCondition(deps: Deps, id: number): Promise<void> {
    if ((await conditions.conditionUses(deps.db)).has(id)) throw new ServiceError(409, 'Chores use the condition');
    if (!(await conditions.deleteCondition(deps.db, id))) throw notFound('Condition');
    await deleteCache(deps.db, `${FORECAST_TEMPLATE_PREFIX}${id}:`);
    deps.onConditionsChanged?.();
}
