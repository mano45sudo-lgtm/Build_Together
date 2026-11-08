import { Prisma } from '@prisma/client';

/**
 * Connectivity failures, as opposed to query bugs. With `@prisma/adapter-pg` a refused connection
 * surfaces as `PrismaClientKnownRequestError` whose `code` is the raw driver code (`ECONNREFUSED`),
 * not a `P1xxx` code, so both families are listed.
 */
const UNAVAILABLE_CODES = new Set([
  // Prisma connection / pool errors.
  'P1001', // can't reach database server
  'P1002', // database server timed out
  'P1008', // operation timed out
  'P1017', // server closed the connection
  'P2024', // timed out fetching a connection from the pool
  // Node / pg driver codes passed through by the adapter.
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  // PostgreSQL SQLSTATEs for a server that is shutting down or not accepting connections.
  '57P01',
  '57P02',
  '57P03',
  '08001',
  '08006',
]);

/** True when an error means the database could not be reached, so the request can be retried. */
export function isDatabaseUnavailableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return UNAVAILABLE_CODES.has(error.code);
  }
  return false;
}
