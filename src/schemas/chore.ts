import { z } from 'zod';

/** Values of a chore as the API and the MCP tools accept them. */
export const choreFields = {
    name: z.string().trim().min(1).max(200),
    groupKey: z.string().trim().min(1).max(100).nullish(),
    kind: z.enum(['recurring', 'one_time']),
    growth: z.enum(['usage', 'time', 'counter']),
    interval: z.number().positive().nullish().describe('Days, or cycles for growth counter. Required for recurring.'),
    intervalMin: z.number().positive().nullish().describe('Default interval / 8'),
    intervalMax: z.number().positive().nullish().describe('Default interval * 4'),
    counterEntity: z.string().min(1).nullish().describe('Home Assistant entity, required for growth counter'),
    importance: z.enum(['optional', 'normal', 'important', 'critical']),
    deadlineMd: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).nullish().describe('Yearly deadline MM-DD'),
    deadlineAt: z.number().int().nullish().describe('Fixed deadline in milliseconds since the epoch'),
    deadlineLeadDays: z.number().int().min(0).max(365).optional(),
    conditionId: z.number().int().positive().nullish().describe('State condition that must be true'),
    boostId: z.number().int().positive().nullish().describe('State condition that makes the chore urgent'),
    forecastId: z.number().int().positive().nullish().describe('Forecast condition for the look-ahead'),
    durationMin: z.number().int().min(1).max(1440),
    effort: z.number().int().min(1).max(5),
    assignment: z.enum(['any', 'all']),
    personIds: z.array(z.number().int()).optional().describe('Empty or absent means all persons'),
    categoryIds: z.array(z.number().int()).optional(),
    seasonFrom: z.number().int().min(1).max(12).nullish(),
    seasonTo: z.number().int().min(1).max(12).nullish(),
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
