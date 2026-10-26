import { Hono, type Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { login } from '../../service/auth.ts';
import type { Deps } from '../../service/deps.ts';
import { ServiceError } from '../../service/errors.ts';
import { loginSchema } from '../../schemas/admin.ts';
import { bearer } from '../auth.ts';
import { body, type AppEnv } from '../env.ts';

/** Allowed login attempts per minute and address. */
const ATTEMPTS = 5;

/** Login attempts per address in the current minute. */
class RateLimiter {
    private readonly hits = new Map<string, number[]>();

    /**
     * Records an attempt and tells if it is allowed.
     *
     * @param key the address
     * @param now the current time
     */
    allow(key: string, now: number): boolean {
        const recent = (this.hits.get(key) ?? []).filter((t) => now - t < 60_000);
        recent.push(now);
        this.hits.set(key, recent);
        if (this.hits.size > 1000) {
            for (const [k, list] of this.hits) if (list.every((t) => now - t >= 60_000)) this.hits.delete(k);
        }
        return recent.length <= ATTEMPTS;
    }
}

/**
 * Returns the address of the client. Behind the reverse proxy it is the first address of X-Forwarded-For.
 *
 * @param c the context
 */
function clientAddress(c: Context): string {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
    try {
        return getConnInfo(c).remote.address ?? 'unknown';
    } catch {
        return 'unknown';
    }
}

/**
 * Creates the routes of the login and the identity.
 *
 * @param deps the dependencies
 */
export function authRoutes(deps: Deps): Hono<AppEnv> {
    const limiter = new RateLimiter();
    const app = new Hono<AppEnv>();

    app.post('/login', async (c) => {
        if (!limiter.allow(clientAddress(c), deps.now())) throw new ServiceError(429, 'Too many attempts');
        const { name, password, label } = await body(c, loginSchema);
        return c.json(await login(deps, name, password, label));
    });

    app.get('/me', bearer(deps), (c) => {
        const { kind, person } = c.var.identity;
        return c.json(person ? { kind, person } : { kind });
    });

    return app;
}
