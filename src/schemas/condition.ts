import { z } from 'zod';
import { iconSchema } from './admin.ts';

/** Body of a new condition. */
export const conditionSchema = z.object({
    name: z.string().trim().min(1).max(100),
    template: z.string().trim().min(1).describe('Home Assistant template that renders to true or false for now'),
    forecastTemplate: z.string().trim().min(1).nullish().describe('Home Assistant template that renders to true or '
        + 'false for one forecast day, with the forecast of the day as the variable day. For the look-ahead'),
    icon: iconSchema,
});

/** Body of a change of a condition. */
export const conditionUpdateSchema = conditionSchema.partial();

/** Values of a new condition. */
export type ConditionInput = z.infer<typeof conditionSchema>;

/** Values of a change of a condition. */
export type ConditionUpdate = z.infer<typeof conditionUpdateSchema>;
