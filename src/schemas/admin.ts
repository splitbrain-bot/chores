import { z } from 'zod';

/** Body of a login. */
export const loginSchema = z.object({
    name: z.string().min(1),
    password: z.string().min(1),
    label: z.string().trim().min(1).max(100).optional().describe('Label of the device for the token list'),
});

const entity = z.string().regex(/^[a-z_]+\.[a-z0-9_]+$/);

/** Name of a Material Design icon, null for no icon. */
export const iconSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).nullish()
    .describe('Name of a Material Design icon, for example silverware-fork-knife');

/** Body of a new person. */
export const personSchema = z.object({
    name: z.string().trim().min(1).max(100),
    haEntity: entity.nullish(),
    distanceEntity: entity.nullish(),
    calendarEntity: entity.nullish(),
    notifyAction: entity.nullish(),
    password: z.string().min(1).nullish(),
    sort: z.number().int().optional(),
    color: z.string().regex(/^#[0-9a-f]{6}$/i).optional().describe('Color of the person as #rrggbb, random for a new '
        + 'person'),
});

/** Body of a change of a person. */
export const personUpdateSchema = personSchema.partial();

/** Body of a new category. */
export const categorySchema = z.object({
    name: z.string().trim().min(1).max(100),
    sort: z.number().int().default(0),
    icon: iconSchema,
});

/** Body of a change of a category. */
export const categoryUpdateSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    sort: z.number().int().optional(),
    icon: iconSchema,
});

/** Body of a new token. */
export const tokenSchema = z.object({
    kind: z.enum(['shared', 'mcp']),
    label: z.string().trim().min(1).max(100),
    personId: z.number().int().nullish(),
});
