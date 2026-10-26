import type { MessageBase } from 'home-assistant-js-websocket';
import type { StateRecord } from '../../src/core/types.ts';
import type { HaApi, HaEntityState } from '../../src/ha/connection.ts';
import type { Deps } from '../../src/service/deps.ts';
import { memoryDb } from '../db/helpers.ts';

/** An in-memory fake of the Home Assistant API. */
export class FakeApi implements HaApi {
    connected = true;
    states: HaEntityState[] = [];
    history: StateRecord[] = [];
    calls: { domain: string; service: string; data?: object; target?: object }[] = [];
    responses = new Map<string, unknown>();
    subscriptions: { message: MessageBase; callback: (event: unknown) => void; closed: boolean }[] = [];
    readyCallbacks: (() => void)[] = [];

    async callService(domain: string, service: string, data?: object, target?: { entity_id: string | string[] }): Promise<unknown> {
        this.calls.push({ domain, service, data, target });
        const response = this.responses.get(`${domain}.${service}`);
        if (response instanceof Error) throw response;
        return typeof response === 'function' ? response(data, target) : response;
    }

    async subscribe<T>(message: MessageBase, callback: (event: T) => void): Promise<() => Promise<void>> {
        const sub = { message, callback: callback as (event: unknown) => void, closed: false };
        this.subscriptions.push(sub);
        if (message.type === 'render_template' && message.variables) {
            const template = String(message.template);
            const day = (message.variables as { day: { precipitation?: number } }).day;
            queueMicrotask(() => callback({ result: template.includes('precipitation == 0') && day.precipitation === 0 } as T));
        }
        return async () => { sub.closed = true; };
    }

    async getStates(): Promise<HaEntityState[]> {
        return this.states;
    }

    async fetchHistory(start: number, entityIds: readonly string[]): Promise<StateRecord[]> {
        return this.history.filter((r) => r.at >= start && entityIds.includes(r.entityId));
    }

    onReady(callback: () => void): void {
        this.readyCallbacks.push(callback);
    }
}

/** A settable clock. */
export class Clock {
    t: number;

    constructor(iso: string) {
        this.t = Date.parse(iso);
    }

    now = (): number => this.t;

    advance(ms: number): void {
        this.t += ms;
    }
}

/**
 * Creates dependencies with a database in memory.
 *
 * @param clock the clock
 * @param ha the fake API, or null
 */
export async function makeDeps(clock: Clock, ha: FakeApi | null = new FakeApi()): Promise<Deps & { fake: FakeApi | null }> {
    return { db: await memoryDb(), ha, now: clock.now, fake: ha };
}
