import type { OccupancyRow, StateRecord } from './types.ts';

/** States that carry no information about the location of a person. */
const INVALID_STATES = new Set(['unknown', 'unavailable']);

/**
 * Tells if a state is a valid tracker state. The states unknown and unavailable are not valid.
 *
 * @param state state of a Home Assistant entity
 */
export function isValidState(state: string): boolean {
    return !INVALID_STATES.has(state);
}

/**
 * Tells if at least one person is at home.
 *
 * @param lastKnown last valid state per person entity
 */
export function anyoneHome(lastKnown: ReadonlyMap<string, string>): boolean {
    for (const state of lastKnown.values()) {
        if (state === 'home') return true;
    }
    return false;
}

/**
 * Returns the value of the presence clock at a moment.
 *
 * Before the first record the clock assumes that somebody was at home. Without any record the clock is the wall
 * clock.
 *
 * @param t milliseconds since the epoch
 * @param rows occupancy rows sorted by startAt
 * @param firstRecordAt time of the first recorded person state, null when no state exists
 * @returns the clock value in milliseconds
 */
export function clockAt(t: number, rows: readonly OccupancyRow[], firstRecordAt: number | null): number {
    if (firstRecordAt === null) return t;
    if (t < firstRecordAt) return t - firstRecordAt;

    let row: OccupancyRow | undefined;
    for (const r of rows) {
        if (r.startAt > t) break;
        row = r;
    }
    if (!row) return 0;
    if (row.endAt === null || t <= row.endAt) return row.clockStart + (t - row.startAt);
    return row.clockStart + (row.endAt - row.startAt);
}

/**
 * Returns the presence time between two moments in milliseconds.
 *
 * @param from start of the period
 * @param to end of the period
 * @param rows occupancy rows sorted by startAt
 * @param firstRecordAt time of the first recorded person state, null when no state exists
 */
export function presenceBetween(from: number, to: number, rows: readonly OccupancyRow[], firstRecordAt: number | null): number {
    return clockAt(to, rows, firstRecordAt) - clockAt(from, rows, firstRecordAt);
}

/**
 * Computes the change of the occupancy for one new person state.
 *
 * @param lastKnown last valid state per person entity before the change, the function updates it
 * @param record the new state
 * @param openRow the open occupancy row, or null when nobody is at home
 * @param rows all occupancy rows sorted by startAt, used for the clock value of a new row
 * @param firstRecordAt time of the first recorded person state
 * @returns the row to close, the row to open, or null for both
 */
export function occupancyChange(
    lastKnown: Map<string, string>,
    record: StateRecord,
    openRow: OccupancyRow | null,
    rows: readonly OccupancyRow[],
    firstRecordAt: number | null,
): { close: number | null; open: OccupancyRow | null } {
    if (!isValidState(record.state)) return { close: null, open: null };
    const before = anyoneHome(lastKnown);
    lastKnown.set(record.entityId, record.state);
    const after = anyoneHome(lastKnown);

    if (before && !after && openRow) return { close: record.at, open: null };
    if (!before && after) {
        return { close: null, open: { startAt: record.at, endAt: null, clockStart: clockAt(record.at, rows, firstRecordAt) } };
    }
    return { close: null, open: null };
}

/**
 * Builds all occupancy rows from the recorded person states.
 *
 * @param records states of the person entities sorted by time
 * @returns the occupancy rows sorted by startAt
 */
export function buildOccupancy(records: readonly StateRecord[]): OccupancyRow[] {
    const rows: OccupancyRow[] = [];
    const lastKnown = new Map<string, string>();
    const firstRecordAt = records[0]?.at ?? null;
    let open: OccupancyRow | null = null;

    for (const record of records) {
        const change = occupancyChange(lastKnown, record, open, rows, firstRecordAt);
        if (change.close !== null && open) {
            open.endAt = change.close;
            open = null;
        }
        if (change.open) {
            open = change.open;
            rows.push(open);
        }
    }
    return rows;
}
