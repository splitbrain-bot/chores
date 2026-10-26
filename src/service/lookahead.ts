import { isLookaheadCandidate, lookahead } from '../core/lookahead.ts';
import { addDays, localDate } from '../core/time.ts';
import type { ChoreWithNeed, ForecastDay, Hint } from '../core/types.ts';
import { getCache, setCache } from '../db/cache.ts';
import { renderOnce, toFlag } from '../ha/templates.ts';
import type { Deps } from './deps.ts';
import { evaluate, FORECAST_KEY, type EvalState } from './evaluate.ts';

/** The look-ahead hints with the age of the forecast. */
export interface LookaheadResult {
    hints: Hint[];
    /** Age of the cached forecast in milliseconds, null without a forecast. */
    forecastAge: number | null;
}

/** Cache key prefix of the forecast template results. */
export const FORECAST_TEMPLATE_PREFIX = 'forecast_template:';

/**
 * Loads the cached daily forecast by local date.
 *
 * @param deps the dependencies
 * @param timeZone IANA time zone
 */
async function loadForecast(deps: Deps, timeZone: string): Promise<{ days: Map<string, ForecastDay>; fetchedAt: number | null }> {
    const cached = await getCache<ForecastDay[]>(deps.db, FORECAST_KEY);
    const days = new Map<string, ForecastDay>();
    for (const day of cached?.value ?? []) {
        const at = Date.parse(day.datetime);
        if (!Number.isNaN(at)) days.set(localDate(at, timeZone), day);
    }
    return { days, fetchedAt: cached?.fetchedAt ?? null };
}

/**
 * Returns the forecast template results per chore and date. Missing results are rendered by Home Assistant and
 * cached until the next forecast refresh.
 *
 * @param deps the dependencies
 * @param chores the evaluated chores
 * @param days the forecast by local date
 * @param state the evaluation state
 */
async function forecastResults(deps: Deps, chores: readonly ChoreWithNeed[], days: ReadonlyMap<string, ForecastDay>,
    state: EvalState): Promise<Map<number, Map<string, boolean | null>>> {
    const today = localDate(state.now, state.settings.time_zone);
    const result = new Map<number, Map<string, boolean | null>>();
    for (const chore of chores) {
        if (!chore.forecastTemplate || chore.deletedAt !== null) continue;
        const perDay = new Map<string, boolean | null>();
        for (let i = 1; i <= state.settings.lookahead_days; i++) {
            const date = addDays(today, i);
            const day = days.get(date);
            if (!day) continue;
            const key = `${FORECAST_TEMPLATE_PREFIX}${chore.id}:${date}`;
            const cached = await getCache<boolean | null>(deps.db, key);
            if (cached) {
                perDay.set(date, cached.value);
                continue;
            }
            if (!deps.ha?.connected) continue;
            let value: boolean | null;
            try {
                value = toFlag(await renderOnce(deps.ha, chore.forecastTemplate, { day })) === 1;
            } catch {
                value = null;
            }
            await setCache(deps.db, key, value, state.now);
            perDay.set(date, value);
        }
        result.set(chore.id, perDay);
    }
    return result;
}

/**
 * Computes the look-ahead hints for the next days.
 *
 * @param deps the dependencies
 */
export async function getLookahead(deps: Deps): Promise<LookaheadResult> {
    const { state, chores } = await evaluate(deps, { kind: 'shared' });
    const personIds = state.persons.map((p) => p.id);
    const candidates = chores.filter((c) => isLookaheadCandidate(c, personIds));
    const forecast = await loadForecast(deps, state.settings.time_zone);
    const hints = lookahead(candidates, {
        now: state.now,
        settings: state.settings,
        personIds,
        holidays: state.holidays,
        calendars: state.calendars,
        forecast: forecast.days,
        forecastResults: await forecastResults(deps, candidates, forecast.days, state),
    });
    return { hints, forecastAge: forecast.fetchedAt === null ? null : state.now - forecast.fetchedAt };
}
