import { z } from 'zod';

const CosmosEnvSchema = z.object({
  COSMOS_ENDPOINT: z.string().url('COSMOS_ENDPOINT must be a valid URL'),
  COSMOS_KEY: z.string().min(1, 'COSMOS_KEY is required'),
  COSMOS_DATABASE: z.string().default('urlist'),
});

function makeEnvGetter<T>(schema: z.ZodType<T>, label: string): () => T {
  let cached: T | null = null;
  const getter = () => {
    if (!cached) {
      const result = schema.safeParse(process.env);
      if (!result.success) {
        const msgs = result.error.issues
          .map((i) => `  ${i.path.join('.')}: ${i.message}`)
          .join('\n');
        throw new Error(`Missing or invalid ${label} environment variables:\n${msgs}`);
      }
      cached = result.data;
    }
    return cached;
  };
  // Expose reset for testing
  (getter as { _reset?: () => void })._reset = () => { cached = null; };
  return getter;
}

export const getCosmosEnv = makeEnvGetter(CosmosEnvSchema, 'Cosmos DB');

/** Reset all cached envs (for testing only). */
export function _resetAllEnvCaches(): void {
  (getCosmosEnv as { _reset?: () => void })._reset?.();
}
