import { z } from 'zod';

/** Schema of the environment variables. */
const envSchema = z.object({
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_PATH: z.string().default('data/chores.sqlite'),
    STATIC_DIR: z.string().default('web/dist'),
    HA_URL: z.url().optional(),
    HA_TOKEN: z.string().optional(),
    INITIAL_PERSON: z.string().optional(),
    INITIAL_PASSWORD: z.string().optional(),
    INITIAL_PERSON_ENTITY: z.string().optional(),
});

/** Validated configuration of the process. */
export type Config = z.infer<typeof envSchema>;

/**
 * Reads and validates the environment variables.
 *
 * @param env the environment, usually process.env
 * @returns the validated configuration
 * @throws Error when a variable has an invalid value
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
    const result = envSchema.safeParse(env);
    if (!result.success) {
        throw new Error(`Invalid environment: ${z.prettifyError(result.error)}`);
    }
    return result.data;
}
