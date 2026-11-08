import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { resolveDatabaseConnectionString } from './database-config.js';
import { env } from './env.js';

/**
 * Prisma client singleton (the ONLY place the Prisma client is constructed). Prisma 7 runs
 * with the Query Compiler, so a driver adapter (`@prisma/adapter-pg`) supplies the connection
 * using the server-side DATABASE_URL. Repositories import this instance and nothing else —
 * no Prisma call ever leaks into services or controllers (backend-engineering skill).
 */
const adapter = new PrismaPg({
  connectionString: resolveDatabaseConnectionString(env.databaseUrl, {
    sslMode: env.databaseSslMode,
    sslRootCert: env.databaseSslRootCert,
  }),
  max: env.databasePoolMax,
  connectionTimeoutMillis: env.databaseConnectionTimeoutMillis,
  idleTimeoutMillis: env.databaseIdleTimeoutMillis,
});

export const prisma = new PrismaClient({ adapter });
