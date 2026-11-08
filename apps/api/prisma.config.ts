import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import {
  loadDatabaseSettings,
  resolveMigrationConnectionString,
} from './src/lib/database-config.js';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const databaseSettings = loadDatabaseSettings(nodeEnv);

/**
 * Prisma 7 configuration. With Query Compiler enabled the datasource URL no longer lives in
 * `schema.prisma`; the Migrate CLI reads it here. The runtime client gets the same database through
 * the `@prisma/adapter-pg` driver adapter (see src/lib/prisma.ts). DATABASE_URL must be set.
 *
 * The CLI gets the same TLS policy translated into the schema engine's own strict parameters
 * (`resolveMigrationConnectionString`), because that engine ignores libpq's `verify-full`.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: resolveMigrationConnectionString(process.env.DATABASE_URL ?? '', databaseSettings),
  },
});
