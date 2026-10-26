import { startOfDay } from '../core/time.ts';
import type { CalendarEvent } from '../core/types.ts';
import type { HaApi } from './connection.ts';

/** An event as calendar.get_events returns it. */
export interface RawCalendarEvent {
    start: string;
    end: string;
    summary: string;
    description?: string | null;
}

/**
 * Reads the raw events of a calendar entity in a period.
 *
 * @param ha the Home Assistant connection
 * @param entityId the calendar entity
 * @param start the start of the period
 * @param end the end of the period
 */
export async function getRawEvents(ha: HaApi, entityId: string, start: number, end: number): Promise<RawCalendarEvent[]> {
    const response = await ha.callService('calendar', 'get_events', {
        start_date_time: new Date(start).toISOString(),
        end_date_time: new Date(end).toISOString(),
    }, { entity_id: entityId }, true);
    const entry = (response as Record<string, { events?: unknown }> | undefined)?.[entityId];
    return Array.isArray(entry?.events) ? entry.events as RawCalendarEvent[] : [];
}

/**
 * Converts raw events to events with timestamps. All-day events have a date without a time and cover whole local
 * days.
 *
 * @param events the raw events
 * @param timeZone IANA time zone for the all-day events
 */
export function toCalendarEvents(events: readonly RawCalendarEvent[], timeZone: string): CalendarEvent[] {
    const result: CalendarEvent[] = [];
    for (const e of events) {
        const allDay = /^\d{4}-\d{2}-\d{2}$/.test(e.start);
        const start = allDay ? startOfDay(e.start, timeZone) : Date.parse(e.start);
        const end = allDay ? startOfDay(e.end, timeZone) : Date.parse(e.end);
        if (Number.isNaN(start) || Number.isNaN(end)) continue;
        result.push({ start, end, summary: e.summary ?? '', allDay });
    }
    return result;
}
