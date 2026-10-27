import type { Condition } from '../core/types.ts';
import { setConditionResult } from '../db/conditions.ts';
import type { Database } from '../db/database.ts';
import type { HaApi } from './connection.ts';

/** An event of a render_template subscription. */
export interface RenderEvent {
    result?: unknown;
    error?: string;
    level?: string;
}

/** Time to wait for the result of a single rendering. */
const RENDER_TIMEOUT = 10_000;

/**
 * Converts a template result to 1 or 0.
 *
 * @param result the rendered value
 */
export function toFlag(result: unknown): 0 | 1 {
    if (typeof result === 'boolean') return result ? 1 : 0;
    if (typeof result === 'number') return result !== 0 ? 1 : 0;
    if (typeof result === 'string') return ['true', 'on', 'yes', '1'].includes(result.trim().toLowerCase()) ? 1 : 0;
    return 0;
}

/** Keeps one render_template subscription per state condition. */
export class TemplateManager {
    private readonly db: Database;
    private readonly ha: HaApi;
    private readonly subscriptions = new Map<string, Promise<(() => Promise<void>) | null>>();

    /**
     * @param db the database
     * @param ha the Home Assistant connection
     */
    constructor(db: Database, ha: HaApi) {
        this.db = db;
        this.ha = ha;
    }

    /**
     * Opens the subscriptions for new or changed templates and closes the ones that are gone.
     *
     * @param conditions all conditions
     */
    async sync(conditions: readonly Condition[]): Promise<void> {
        const wanted = new Map<string, Condition>();
        for (const condition of conditions) {
            if (condition.kind === 'state') wanted.set(key(condition.id, condition.template), condition);
        }

        for (const [k, sub] of this.subscriptions) {
            if (wanted.has(k)) continue;
            this.subscriptions.delete(k);
            const unsubscribe = await sub;
            await unsubscribe?.().catch(() => undefined);
        }
        for (const [k, c] of wanted) {
            if (!this.subscriptions.has(k)) this.subscriptions.set(k, this.open(c.id, c.template));
        }
        await Promise.all(this.subscriptions.values());
    }

    /** Number of open subscriptions. */
    get size(): number {
        return this.subscriptions.size;
    }

    /**
     * Opens one subscription. A template that Home Assistant rejects at once gets a null result and the error text.
     *
     * @param id the condition id
     * @param template the template source
     * @returns the function that closes the subscription, or null after an error
     */
    private async open(id: number, template: string): Promise<(() => Promise<void>) | null> {
        const store = (result: number | null, error: string | null) =>
            setConditionResult(this.db, id, result, error).catch((err) => console.error('Template store failed', err));
        try {
            return await this.ha.subscribe<RenderEvent>(
                { type: 'render_template', template, report_errors: true },
                (event) => {
                    if (event.error !== undefined) void store(null, event.error);
                    else void store(toFlag(event.result), null);
                },
            );
        } catch (err) {
            await store(null, errorText(err));
            return null;
        }
    }
}

/**
 * Renders a template once with variables.
 *
 * @param ha the Home Assistant connection
 * @param template the template source
 * @param variables the template variables
 * @returns the rendered value
 * @throws Error on a render error or a timeout
 */
export async function renderOnce(ha: HaApi, template: string, variables: object): Promise<unknown> {
    let unsubscribe: (() => Promise<void>) | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await new Promise<unknown>((resolve, reject) => {
            timer = setTimeout(() => reject(new Error('Template timeout')), RENDER_TIMEOUT);
            ha.subscribe<RenderEvent>({ type: 'render_template', template, variables, report_errors: true }, (event) => {
                if (event.error !== undefined) reject(new Error(event.error));
                else resolve(event.result);
            }).then((u) => { unsubscribe = u; }, reject);
        });
    } finally {
        clearTimeout(timer);
        const u = unsubscribe as (() => Promise<void>) | null;
        if (u) await u().catch(() => undefined);
    }
}

/**
 * Builds the subscription key of a template.
 *
 * @param id the condition id
 * @param template the template source
 */
function key(id: number, template: string): string {
    return `${id}\u0000${template}`;
}

/**
 * Returns the message of an error from Home Assistant.
 *
 * @param err the error
 */
function errorText(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) return String(err.message);
    return String(err);
}
