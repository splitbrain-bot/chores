import {
    createConnection,
    createLongLivedTokenAuth,
    ERR_INVALID_AUTH,
    type Connection,
    type MessageBase,
} from 'home-assistant-js-websocket';
import type { StateRecord } from '../core/types.ts';
import { parseHistory } from './history.ts';

/** One entity state as Home Assistant sends it. */
export interface HaEntityState {
    entity_id: string;
    state: string;
    last_changed: string;
}

/** Functions of Home Assistant that the tool uses. */
export interface HaApi {
    /** True while the WebSocket connection is open. */
    readonly connected: boolean;

    /**
     * Calls an action.
     *
     * @param domain the domain, for example notify
     * @param service the action name
     * @param data the action data
     * @param target the target entities
     * @param returnResponse true for actions that return data
     * @returns the response of the action, or undefined
     */
    callService(domain: string, service: string, data?: object, target?: { entity_id: string | string[] },
        returnResponse?: boolean): Promise<unknown>;

    /**
     * Opens a subscription.
     *
     * @param message the subscribe message
     * @param callback receives every event of the subscription
     * @returns a function that closes the subscription
     */
    subscribe<T>(message: MessageBase, callback: (event: T) => void): Promise<() => Promise<void>>;

    /** Returns the current states of all entities. */
    getStates(): Promise<HaEntityState[]>;

    /**
     * Reads the recorded states of entities since a moment.
     *
     * @param start the start of the period
     * @param entityIds the entities
     */
    fetchHistory(start: number, entityIds: readonly string[]): Promise<StateRecord[]>;

    /**
     * Registers a function for the ready event after a reconnect.
     *
     * @param callback the function
     */
    onReady(callback: () => void): void;
}

/** The connection to Home Assistant over WebSocket and REST. */
export class HomeAssistant implements HaApi {
    /** The library connection, set after the start. */
    private conn: Connection | null = null;

    /** Functions for the ready event. */
    private readyCallbacks: (() => void)[] = [];

    /** The base URL of Home Assistant without a trailing slash. */
    private readonly url: string;

    /** The long-lived access token. */
    private readonly token: string;

    /**
     * @param url the base URL of Home Assistant
     * @param token a long-lived access token
     */
    constructor(url: string, token: string) {
        this.url = url.replace(/\/$/, '');
        this.token = token;
    }

    /**
     * Opens the connection. The library retries the first connect forever and reconnects after a loss.
     *
     * @throws Error when the token is invalid
     */
    async start(): Promise<void> {
        const auth = createLongLivedTokenAuth(this.url, this.token);
        try {
            this.conn = await createConnection({ auth, setupRetry: -1 });
        } catch (err) {
            throw new Error(err === ERR_INVALID_AUTH ? 'Home Assistant rejected the token' : `Home Assistant error ${String(err)}`,
                { cause: err });
        }
        this.conn.addEventListener('ready', () => {
            for (const cb of this.readyCallbacks) cb();
        });
        this.conn.addEventListener('disconnected', () => console.warn('Home Assistant connection lost'));
    }

    /** Closes the connection. */
    close(): void {
        this.conn?.close();
    }

    get connected(): boolean {
        return this.conn?.connected ?? false;
    }

    async callService(domain: string, service: string, data?: object, target?: { entity_id: string | string[] },
        returnResponse = false): Promise<unknown> {
        const result = await this.connection().sendMessagePromise<{ response?: unknown }>({
            type: 'call_service', domain, service, service_data: data, target,
            ...(returnResponse ? { return_response: true } : {}),
        });
        return result?.response;
    }

    subscribe<T>(message: MessageBase, callback: (event: T) => void): Promise<() => Promise<void>> {
        return this.connection().subscribeMessage<T>(callback, message);
    }

    getStates(): Promise<HaEntityState[]> {
        return this.connection().sendMessagePromise<HaEntityState[]>({ type: 'get_states' });
    }

    async fetchHistory(start: number, entityIds: readonly string[]): Promise<StateRecord[]> {
        if (entityIds.length === 0) return [];
        const url = new URL(`${this.url}/api/history/period/${new Date(start).toISOString()}`);
        url.searchParams.set('filter_entity_id', entityIds.join(','));
        url.searchParams.set('end_time', new Date().toISOString());
        url.searchParams.set('minimal_response', '');
        url.searchParams.set('no_attributes', '');
        const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
        if (!res.ok) throw new Error(`History request failed with status ${res.status}`);
        return parseHistory(await res.json());
    }

    onReady(callback: () => void): void {
        this.readyCallbacks.push(callback);
    }

    /**
     * Returns the open connection.
     *
     * @throws Error before the start
     */
    private connection(): Connection {
        if (!this.conn) throw new Error('Home Assistant connection not started');
        return this.conn;
    }
}
