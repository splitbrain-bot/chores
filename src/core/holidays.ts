/** A raw event of the holiday calendar. */
export interface HolidayEvent {
    /** Local date YYYY-MM-DD of the first day. */
    start: string;
    summary: string;
    description: string | null;
}

/**
 * Tells if an event of the holiday calendar is a public holiday in a state.
 *
 * National holidays have the description "Public holiday". Regional holidays have the description "Public holiday
 * in" with a list of states. Observances have other descriptions.
 *
 * @param event the calendar event
 * @param state name of the state, for example Berlin
 */
export function isPublicHoliday(event: HolidayEvent, state: string): boolean {
    const description = event.description ?? '';
    if (!description.startsWith('Public holiday')) return false;
    const regional = description.startsWith('Public holiday in ') || event.summary.includes('(regional holiday)');
    if (!regional) return true;
    const firstLine = description.split('\n')[0] ?? '';
    return firstLine.split(/,\s*|\s+in\s+/).map((s) => s.trim()).includes(state);
}

/**
 * Returns the local dates of the public holidays in a state.
 *
 * @param events events of the holiday calendar
 * @param state name of the state
 */
export function publicHolidays(events: readonly HolidayEvent[], state: string): string[] {
    const dates = new Set(events.filter((e) => isPublicHoliday(e, state)).map((e) => e.start));
    return [...dates].sort();
}
