import { describe, expect, it, vi } from 'vitest';
import { createGracefulShutdown } from './graceful-shutdown.js';

function silentLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('graceful shutdown', () => {
  it('waits for HTTP drain before disconnecting Prisma and is idempotent', async () => {
    let finishClose: ((error?: Error) => void) | undefined;
    const events: string[] = [];
    const server = { close: vi.fn((callback) => (finishClose = callback)) };
    const disconnect = vi.fn(async () => void events.push('disconnect'));
    const shutdown = createGracefulShutdown({
      server,
      disconnect,
      logger: silentLogger(),
      signal: 'SIGTERM',
      drainTimeoutMs: 200,
    });

    const first = shutdown();
    const second = shutdown();
    expect(first).toBe(second);
    expect(disconnect).not.toHaveBeenCalled();
    events.push('close');
    finishClose?.();

    expect(await first).toBe(0);
    expect(events).toEqual(['close', 'disconnect']);
    expect(server.close).toHaveBeenCalledOnce();
  });

  it('closes lingering connections after the drain deadline and reports failure', async () => {
    const logger = silentLogger();
    const server = { close: vi.fn(() => undefined), closeAllConnections: vi.fn() };
    const shutdown = createGracefulShutdown({
      server,
      disconnect: async () => undefined,
      logger,
      signal: 'SIGINT',
      drainTimeoutMs: 5,
      disconnectTimeoutMs: 100,
    });

    expect(await shutdown()).toBe(1);
    expect(server.closeAllConnections).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('fails safely when pool disconnect rejects', async () => {
    const logger = silentLogger();
    const server = { close: vi.fn((callback) => callback()) };
    const shutdown = createGracefulShutdown({
      server,
      disconnect: async () => {
        throw new Error('private adapter detail');
      },
      logger,
      signal: 'SIGTERM',
    });

    expect(await shutdown()).toBe(1);
    expect(logger.error).toHaveBeenCalledWith('database disconnect failed');
  });
});
