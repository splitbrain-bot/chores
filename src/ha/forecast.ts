import type { ForecastDay } from '../core/types.ts';
import type { HaApi } from './connection.ts';

/**
 * Reads the daily forecast of a weather entity.
 *
 * @param ha the Home Assistant connection
 * @param entityId the weather entity
 */
export async function getDailyForecast(ha: HaApi, entityId: string): Promise<ForecastDay[]> {
    const response = await ha.callService('weather', 'get_forecasts', { type: 'daily' }, { entity_id: entityId }, true);
    return parseForecast(response, entityId);
}

/**
 * Extracts the forecast list from the response of weather.get_forecasts.
 *
 * @param response the action response
 * @param entityId the weather entity
 */
export function parseForecast(response: unknown, entityId: string): ForecastDay[] {
    const entry = (response as Record<string, { forecast?: unknown }> | undefined)?.[entityId];
    if (!Array.isArray(entry?.forecast)) return [];
    return (entry.forecast as ForecastDay[]).filter((d) => typeof d?.datetime === 'string');
}
