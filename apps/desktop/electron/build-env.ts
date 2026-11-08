import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import type { BuildEnvironment } from './main/api-config';

/**
 * Build-time environment selection for `electron.vite.config.ts` (never bundled into the app).
 *
 * Vite loads `.env` and `.env.local` in EVERY mode, then `.env.[mode]` and `.env.[mode].local`.
 * Anything that differs between development and production must therefore live only in the
 * mode files; otherwise development values (a localhost API, a test Clerk key) leak into a
 * production bundle. `assertNoSharedEnvironmentValues` makes that mistake a build error.
 */

/** Values that identify an environment and so must never sit in a mode-agnostic env file. */
export const ENVIRONMENT_SPECIFIC_KEYS = [
  'BT_API_BASE_URL',
  'VITE_API_BASE_URL',
  'VITE_CLERK_PUBLISHABLE_KEY',
  'VITE_CLERK_FRONTEND_API_HOST',
] as const;

const SHARED_ENV_FILES = ['.env', '.env.local'] as const;

/** Map a Vite mode to a build environment. Only the two supported modes are accepted. */
export function buildEnvironmentForMode(mode: string): BuildEnvironment {
  if (mode === 'development' || mode === 'production') return mode;
  throw new Error(
    `Unsupported desktop build mode "${mode}". Use "development" (pnpm desktop:dev, ` +
      'pnpm desktop:build:dev) or "production" (pnpm desktop:build).',
  );
}

/** Throw when a mode-agnostic env file defines a value that belongs to one environment. */
export function assertNoSharedEnvironmentValues(envDir: string): void {
  const offending: string[] = [];
  for (const file of SHARED_ENV_FILES) {
    const path = join(envDir, file);
    if (!existsSync(path)) continue;
    const parsed = parseEnv(readFileSync(path, 'utf8'));
    for (const key of ENVIRONMENT_SPECIFIC_KEYS) {
      if (parsed[key]?.trim()) offending.push(`${file}: ${key}`);
    }
  }
  if (offending.length > 0) {
    throw new Error(
      `Environment-specific values found in shared env files (${offending.join(', ')}). ` +
        'Vite loads these files in every mode, so they would leak into other builds. Move them ' +
        'to apps/desktop/.env.development or apps/desktop/.env.production ' +
        '(see the matching .example files).',
    );
  }
}
