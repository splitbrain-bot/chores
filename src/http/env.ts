import type { Context } from 'hono';
import type { z } from 'zod';
import type { Identity } from '../service/auth.ts';
import { ServiceError } from '../service/errors.ts';

/** Hono environment of the app. */
export interface AppEnv {
    Variables: {
        identity: Identity;
    };
}

/**
 * Parses and validates the JSON body of a request.
 *
 * @param c the context
 * @param schema the Zod schema
 * @throws ServiceError 400 for an invalid body
 */
export async function body<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
    let json: unknown;
    try {
        json = await c.req.json();
    } catch {
        throw new ServiceError(400, 'The body is not valid JSON');
    }
    const result = schema.safeParse(json);
    if (!result.success) throw new ServiceError(400, result.error.issues.map(formatIssue).join('; '));
    return result.data;
}

/**
 * Returns a numeric path parameter.
 *
 * @param c the context
 * @param name the parameter name
 * @throws ServiceError 404 for a value that is not a positive integer
 */
export function idParam(c: Context, name = 'id'): number {
    const value = Number(c.req.param(name));
    if (!Number.isInteger(value) || value <= 0) throw new ServiceError(404, 'Not found');
    return value;
}

/**
 * Formats one Zod issue as text.
 *
 * @param issue the issue
 */
function formatIssue(issue: z.core.$ZodIssue): string {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
}
