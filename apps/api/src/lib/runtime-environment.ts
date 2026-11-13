/**
 * The runtime environments Cue supports. Every production guard (database TLS, CORS, proxy trust,
 * Clerk keys, …) switches on `production`; `test` is set by the Vitest harnesses.
 *
 * Validation is deliberately strict — exact lowercase values, no trimming — because an unknown value
 * such as `staging` or `Production` used to be treated as "not production" and silently fell back to
 * development defaults (localhost CORS, TLS disabled, no Clerk requirements).
 *
 * Shared by the API runtime (`env.ts`) and the Prisma CLI (`prisma.config.ts`), so both interpret
 * NODE_ENV identically. Kept dependency-free because the Docker image ships it alongside
 * `prisma.config.ts`.
 */
export const RUNTIME_ENVIRONMENTS = ['development', 'test', 'production'] as const;

export type RuntimeEnvironment = (typeof RUNTIME_ENVIRONMENTS)[number];

/** Unset NODE_ENV keeps the existing local-development default. */
export const DEFAULT_RUNTIME_ENVIRONMENT: RuntimeEnvironment = 'development';

export function resolveRuntimeEnvironment(raw: string | undefined): RuntimeEnvironment {
  if (raw === undefined || raw === '') return DEFAULT_RUNTIME_ENVIRONMENT;
  if ((RUNTIME_ENVIRONMENTS as readonly string[]).includes(raw)) return raw as RuntimeEnvironment;
  throw new Error(
    `NODE_ENV must be one of ${RUNTIME_ENVIRONMENTS.join(', ')} (exact, lowercase); unsupported values are rejected instead of falling back to development defaults`,
  );
}
