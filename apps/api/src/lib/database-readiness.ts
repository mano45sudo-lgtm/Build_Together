import { prisma } from './prisma.js';

export const DATABASE_READINESS_TIMEOUT_MS = 2_500;
export const DATABASE_READINESS_TRANSACTION_TIMEOUT_MS = 2_000;
export const DATABASE_READINESS_MAX_WAIT_MS = 1_000;

export interface ReadinessTransactionClient {
  $transaction<T>(
    callback: (transaction: {
      $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
    }) => Promise<T>,
    options: { maxWait: number; timeout: number },
  ): Promise<T>;
}

/** Executes a bounded `SELECT 1` through the existing Prisma pool. */
export function createDatabaseReadinessProbe(
  client: ReadinessTransactionClient = prisma as unknown as ReadinessTransactionClient,
): () => Promise<void> {
  return () =>
    client.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT 1`;
      },
      {
        maxWait: DATABASE_READINESS_MAX_WAIT_MS,
        timeout: DATABASE_READINESS_TRANSACTION_TIMEOUT_MS,
      },
    );
}

/** Bound the readiness request even if the driver or adapter does not settle promptly. */
export async function checkDatabaseReadiness(
  probe: () => Promise<unknown> = createDatabaseReadinessProbe(),
  timeoutMs = DATABASE_READINESS_TIMEOUT_MS,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('DATABASE_READINESS_TIMEOUT')), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
