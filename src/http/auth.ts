import { createMiddleware } from 'hono/factory';
import { authenticate, can, type Right, type TokenKind } from '../service/auth.ts';
import type { Deps } from '../service/deps.ts';
import { ServiceError } from '../service/errors.ts';
import type { AppEnv } from './env.ts';

/**
 * Creates the middleware that checks the bearer token and stores the identity.
 *
 * @param deps the dependencies
 * @param kinds the accepted token kinds, all kinds when absent
 */
export function bearer(deps: Deps, kinds?: readonly TokenKind[]) {
    return createMiddleware<AppEnv>(async (c, next) => {
        const header = c.req.header('authorization') ?? '';
        const match = /^Bearer\s+(\S+)$/i.exec(header);
        const identity = match ? await authenticate(deps, match[1]!) : null;
        if (!identity) throw new ServiceError(401, 'Missing or invalid token');
        if (kinds && !kinds.includes(identity.kind)) throw new ServiceError(403, 'This token cannot use this endpoint');
        c.set('identity', identity);
        await next();
    });
}

/**
 * Creates the middleware that checks a right of the token.
 *
 * @param right the right
 */
export function requires(right: Right) {
    return createMiddleware<AppEnv>(async (c, next) => {
        if (!can(c.var.identity.kind, right)) throw new ServiceError(403, 'This token has no right for this action');
        await next();
    });
}
