import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Loads `apps/api/.env` into `process.env` BEFORE any configuration is read.
 *
 * `index.ts` imports `lib/env.ts`, which validates `process.env` eagerly at module-evaluation time
 * (`DATABASE_URL` is required for the Prisma/PostgreSQL-backed identity layer). Nothing on that
 * startup path ever loaded the dotenv file — `dotenv/config` was imported only in `prisma.config.ts`
 * (used by the Prisma CLI), so `pnpm dev` and `node dist/index.js` crashed immediately with
 * `Missing required environment variable: DATABASE_URL` unless the caller exported the vars itself.
 * The Vitest suites were unaffected because `src/test/setup.ts` seeds `process.env` directly.
 *
 * The path is resolved from THIS module's own location, not `process.cwd()`, so the correct `.env`
 * is read whether the API is launched from the repo root (`pnpm -r dev`), from the package dir, or
 * as the compiled `dist/` bundle. In both layouts this file sits one dir below the package root:
 *   dev   →  apps/api/src/lib/     → ../../.env = apps/api/.env
 *   prod  →  apps/api/dist/lib/    → ../../.env = apps/api/.env
 * Real process env always wins — dotenv never overrides variables that are already set — so an
 * explicit `DATABASE_URL` (CI, container, staging) still takes precedence over the local file.
 */
const here = import.meta.dirname;
const envPath = join(here, '..', '..', '.env');

if (existsSync(envPath)) {
  const result = loadDotenv({ path: envPath });
  // A malformed .env should not silently boot with a partial config; surface it at the process edge.
  if (result.error) {
    console.error(`[api] failed to parse ${envPath}: ${result.error.message}`);
  }
}
