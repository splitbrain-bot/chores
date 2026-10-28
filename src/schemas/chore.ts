import { z } from 'zod';

/** Values of a chore as the API and the MCP tools accept them. */
export const choreFields = {
    name: z.string().trim().min(1).max(200).describe('Chores with the same name form a group, for example the same '
        + 'chore in several rooms'),
    kind: z.enum(['recurring', 'one_time']),
    interval: z.number().positive().nullish().describe('Days. Required for recurring.'),
    pausesWhenAway: z.boolean().optional().describe('True when the elapsed time counts only while a person is at '
        + 'home. Default true'),
    deadline: z.union([z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/), z.number().int()]).nullish()
        .describe('Yearly deadline MM-DD for a recurring chore, or a fixed deadline in milliseconds since the epoch '
            + 'for a one-time task. The chore is urgent in the lead period before the deadline'),
    requiresId: z.number().int().positive().nullish().describe('Condition that must be true for the chore'),
    triggerId: z.number().int().positive().nullish().describe('Condition that makes the chore urgent when it becomes '
        + 'true, until the chore is done'),
    durationMin: z.number().int().min(1).max(1440),
    effort: z.number().int().min(1).max(5),
    personIds: z.array(z.number().int()).optional().describe('Empty or absent means any person, one person means only '
        + 'this person, more persons must do the chore together'),
    categoryIds: z.array(z.number().int()).optional(),
    seasonMonths: z.array(z.number().int().min(1).max(12)).optional()
        .describe('Months of the season, 1 is January. Empty or absent means the whole year'),
    noisy: z.boolean().optional(),
    notes: z.string().max(5000).nullish(),
    lastDoneAt: z.number().int().optional().describe('Milliseconds since the epoch, default now'),
};

/** Schema of a new chore. */
export const choreInputSchema = z.object(choreFields);

/** Schema of a change of a chore. */
export const choreUpdateSchema = z.object(choreFields).partial();

/** Values of a new chore. */
export type ChoreInput = z.infer<typeof choreInputSchema>;

/** Values of a change of a chore. */
export type ChoreUpdate = z.infer<typeof choreUpdateSchema>;
