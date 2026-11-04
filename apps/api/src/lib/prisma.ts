import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from './env.js';

/**
 * Prisma client singleton (the ONLY place the Prisma client is constructed). Prisma 7 runs
 * with the Query Compiler, so a driver adapter (`@prisma/adapter-pg`) supplies the connection
 * using the server-side DATABASE_URL. Repositories import this instance and nothing else —
 * no Prisma call ever leaks into services or controllers (backend-engineering skill).
 */
const adapter = new PrismaPg({ connectionString: env.databaseUrl });

export const prisma = new PrismaClient({ adapter });
