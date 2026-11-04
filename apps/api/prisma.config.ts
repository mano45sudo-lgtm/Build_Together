import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 configuration. With Query Compiler enabled the datasource URL no longer lives in
 * `schema.prisma`; the Migrate CLI reads it here. The runtime client gets the same URL through
 * the `@prisma/adapter-pg` driver adapter (see src/lib/prisma.ts). DATABASE_URL must be set.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
