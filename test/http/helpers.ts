import type { Hono } from 'hono';
import { putSettings } from '../../src/db/settings.ts';
import { createApp } from '../../src/http/app.ts';
import type { AppEnv } from '../../src/http/env.ts';
import { createPerson } from '../../src/service/admin.ts';
import { createToken, login } from '../../src/service/auth.ts';
import type { Deps } from '../../src/service/deps.ts';
import { Clock, makeDeps } from '../service/helpers.ts';

/** An app with tokens of every kind. */
export interface TestApp {
    app: Hono<AppEnv>;
    deps: Deps;
    clock: Clock;
    person: string;
    shared: string;
    mcp: string;
    /** Sends a request with a token and a JSON body. */
    call: (method: string, path: string, token?: string | null, json?: unknown) => Promise<Response>;
}

/**
 * Creates an app with a person Andi and tokens.
 */
export async function testApp(): Promise<TestApp> {
    const clock = new Clock('2026-10-31T09:00:00+01:00');
    const deps = await makeDeps(clock);
    await putSettings(deps.db, { ha_frame_ancestors: ['https://ha.example.org', 'http://192.168.1.10:8123'] });
    const andi = await createPerson(deps, { name: 'Andi', haEntity: 'person.a', password: 'geheim' });
    const person = (await login(deps, 'Andi', 'geheim')).token;
    const shared = (await createToken(deps, 'shared', 'Tablet', null)).plain;
    const mcp = (await createToken(deps, 'mcp', 'Claude Code', andi.id)).plain;
    const app = createApp(deps, { version: 'test', staticDir: null, health: () => ({ haConnected: true, lastEventAt: 5 }) });
    const call = (method: string, path: string, token: string | null = person, json?: unknown) => {
        const headers: Record<string, string> = {};
        if (token) headers.authorization = `Bearer ${token}`;
        if (json !== undefined) headers['content-type'] = 'application/json';
        return Promise.resolve(app.request(path, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) }));
    };
    return { app, deps, clock, person, shared, mcp, call };
}
