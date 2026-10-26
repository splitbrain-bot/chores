import type { StateRecord } from '../core/types.ts';

/** One state in a minimal history response. Only the first state of an entity has the entity id. */
interface HistoryState {
    entity_id?: string;
    state: string;
    last_changed: string;
}

/**
 * Converts a history response to state records sorted by time.
 *
 * @param body the response body, one list of states per entity
 */
export function parseHistory(body: unknown): StateRecord[] {
    if (!Array.isArray(body)) return [];
    const records: StateRecord[] = [];
    for (const list of body as HistoryState[][]) {
        const entityId = list[0]?.entity_id;
        if (!entityId) continue;
        for (const s of list) {
            const at = Date.parse(s.last_changed);
            if (!Number.isNaN(at)) records.push({ entityId, state: s.state, at });
        }
    }
    return records.sort((a, b) => a.at - b.at);
}
