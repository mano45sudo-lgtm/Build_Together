import { describe, expect, it, vi } from 'vitest';
import {
  checkDatabaseReadiness,
  createDatabaseReadinessProbe,
  DATABASE_READINESS_MAX_WAIT_MS,
  DATABASE_READINESS_TRANSACTION_TIMEOUT_MS,
} from './database-readiness.js';

describe('database readiness probe', () => {
  it('runs SELECT 1 in a bounded Prisma transaction', async () => {
    const queryRaw = vi.fn().mockResolvedValue(1);
    const transaction = vi.fn(async (callback, options) => {
      expect(options).toEqual({
        maxWait: DATABASE_READINESS_MAX_WAIT_MS,
        timeout: DATABASE_READINESS_TRANSACTION_TIMEOUT_MS,
      });
      return callback({ $queryRaw: queryRaw });
    });

    await createDatabaseReadinessProbe({ $transaction: transaction })();
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it('propagates a database failure for the HTTP readiness boundary to sanitize', async () => {
    await expect(
      checkDatabaseReadiness(() => Promise.reject(new Error('connection refused'))),
    ).rejects.toThrow('connection refused');
  });

  it('bounds an unresponsive probe', async () => {
    await expect(checkDatabaseReadiness(() => new Promise(() => undefined), 5)).rejects.toThrow(
      'DATABASE_READINESS_TIMEOUT',
    );
  });
});
