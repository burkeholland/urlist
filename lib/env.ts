import { z } from 'zod';

const CosmosEnvSchema = z.object({
  COSMOS_ENDPOINT: z.string().url('COSMOS_ENDPOINT must be a valid URL'),
  COSMOS_KEY: z.string().min(1, 'COSMOS_KEY is required'),
  COSMOS_DATABASE: z.string().default('urlist'),
});

const AuthEnvSchema = z.object({
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
});

const GitHubEnvSchema = z.object({
  GITHUB_CLIENT_ID: z.string().min(1, 'GITHUB_CLIENT_ID is required'),
  GITHUB_CLIENT_SECRET: z.string().min(1, 'GITHUB_CLIENT_SECRET is required'),
});

export type CosmosEnv = z.infer<typeof CosmosEnvSchema>;
export type AuthEnv = z.infer<typeof AuthEnvSchema>;
export type GitHubEnv = z.infer<typeof GitHubEnvSchema>;

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
export const getAuthEnv = makeEnvGetter(AuthEnvSchema, 'Auth');
export const getGitHubEnv = makeEnvGetter(GitHubEnvSchema, 'GitHub OAuth');

/** Reset all cached envs (for testing only). */
export function _resetAllEnvCaches(): void {
  (getCosmosEnv as { _reset?: () => void })._reset?.();
  (getAuthEnv as { _reset?: () => void })._reset?.();
  (getGitHubEnv as { _reset?: () => void })._reset?.();
}
