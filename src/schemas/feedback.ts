import { z } from 'zod';

/** Body of a done call. */
export const doneSchema = z.object({
    also: z.array(z.number().int()).default([]).describe('Chores of the same group that were done together'),
});

/** Body of a postpone call. */
export const postponeSchema = z.object({
    reason: z.enum(['no_time', 'no_energy', 'not_yet']),
});
