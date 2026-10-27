import { z } from 'zod';

/** Body of a new condition. */
export const conditionSchema = z.object({
    name: z.string().trim().min(1).max(100),
    kind: z.enum(['state', 'forecast']).describe('state has a current result, forecast gets the forecast of one day '
        + 'as the variable day'),
    template: z.string().trim().min(1).describe('Home Assistant template that renders to true or false'),
});

/** Body of a change of a condition. The kind cannot change. */
export const conditionUpdateSchema = conditionSchema.omit({ kind: true }).partial();

/** Values of a new condition. */
export type ConditionInput = z.infer<typeof conditionSchema>;

/** Values of a change of a condition. */
export type ConditionUpdate = z.infer<typeof conditionUpdateSchema>;
