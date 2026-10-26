import { buildOccupancy, occupancyChange } from '../core/clock.ts';
import { DAY, type StateRecord } from '../core/types.ts';
import type { Database } from '../db/database.ts';
import { firstStateAt, insertStates, lastStateAt, lastValidStateBefore, latestState, listStates } from '../db/ha_state.ts';
import { closeOccupancy, insertOccupancy, listOccupancy, openOccupancy, replaceOccupancy } from '../db/occupancy.ts';
import type { HaApi } from './connection.ts';

/** Time that Home Assistant keeps the history by default. */
export const HISTORY_LIMIT = 10 * DAY;

/** A state change event of a state trigger subscription. */
interface TriggerEvent {
    variables?: {
        trigger?: {
            entity_id?: string;
            to_state?: { state: string; last_changed: string } | null;
        };
    };
}

/** The entities that the watcher records. */
export interface WatchList {
    /** Person entities. Their states drive the occupancy. */
    persons: string[];
    /** Distance and counter entities. */
    others: string[];
}

/** Records the state changes of the watched entities and keeps the occupancy up to date. */
export class Watcher {
    private readonly db: Database;
    private readonly ha: HaApi;
    private list: WatchList = { persons: [], others: [] };
    private unsubscribe: (() => Promise<void>) | null = null;

    /** Time of the last received state change. */
    lastEventAt: number | null = null;

    /**
     * @param db the database
     * @param ha the Home Assistant connection
     */
    constructor(db: Database, ha: HaApi) {
        this.db = db;
        this.ha = ha;
    }

    /** All watched entity ids. */
    get entities(): string[] {
        return [...new Set([...this.list.persons, ...this.list.others])];
    }

    /**
     * Sets the watched entities and subscribes again when the list changed.
     *
     * @param list the new list
     */
    async setEntities(list: WatchList): Promise<void> {
        const before = JSON.stringify([[...this.list.persons].sort(), [...this.list.others].sort()]);
        const after = JSON.stringify([[...list.persons].sort(), [...list.others].sort()]);
        this.list = { persons: [...list.persons], others: [...list.others] };
        if (before === after && this.unsubscribe) return;

        if (this.unsubscribe) {
            await this.unsubscribe().catch(() => undefined);
            this.unsubscribe = null;
        }
        if (this.entities.length === 0) return;
        this.unsubscribe = await this.ha.subscribe<TriggerEvent>(
            { type: 'subscribe_trigger', trigger: { trigger: 'state', entity_id: this.entities } },
            (event) => {
                const t = event.variables?.trigger;
                if (!t?.entity_id || !t.to_state) return;
                const record = { entityId: t.entity_id, state: t.to_state.state, at: Date.parse(t.to_state.last_changed) };
                this.handleState(record).catch((err) => console.error('State update failed', err));
            },
        );
    }

    /**
     * Stores a state change and updates the occupancy for person entities.
     *
     * @param record the new state
     */
    async handleState(record: StateRecord): Promise<void> {
        this.lastEventAt = Date.now();
        const persons = this.list.persons;
        await this.db.transaction().execute(async (trx) => {
            if (!persons.includes(record.entityId)) {
                await insertStates(trx, [record]);
                return;
            }
            const lastKnown = new Map<string, string>();
            for (const entity of persons) {
                const s = await lastValidStateBefore(trx, entity, record.at + 1);
                if (s) lastKnown.set(entity, s.state);
            }
            await insertStates(trx, [record]);
            const rows = await listOccupancy(trx);
            const open = (await openOccupancy(trx)) ?? null;
            const first = await firstStateAt(trx, persons);
            const change = occupancyChange(lastKnown, record, open, rows, first);
            if (change.close !== null) await closeOccupancy(trx, change.close);
            if (change.open) await insertOccupancy(trx, change.open);
        });
    }

    /**
     * Records the states since the last record and rebuilds the occupancy. For a gap longer than the history of
     * Home Assistant, the current states are recorded at the current time.
     *
     * @param now the current time
     */
    async gapFill(now = Date.now()): Promise<void> {
        const entities = this.entities;
        if (entities.length === 0) return;
        const last = await lastStateAt(this.db);
        let records: StateRecord[];

        if (last === null || now - last > HISTORY_LIMIT) {
            const states = await this.ha.getStates();
            records = states.filter((s) => entities.includes(s.entity_id))
                .map((s) => ({ entityId: s.entity_id, state: s.state, at: now }));
        } else {
            const known = new Set<string>();
            for (const entity of entities) {
                if (await latestState(this.db, entity)) known.add(entity);
            }
            records = (await this.ha.fetchHistory(last, entities))
                .filter((r) => r.at > last || (!known.has(r.entityId) && r.at >= last));
        }

        await this.db.transaction().execute(async (trx) => {
            await insertStates(trx, records);
            await replaceOccupancy(trx, buildOccupancy(await listStates(trx, this.list.persons)));
        });
    }
}
