type ShutdownServer = {
  close(callback: (error?: Error) => void): void;
  closeAllConnections?: () => void;
};

type ShutdownLogger = {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
};

export interface GracefulShutdownOptions {
  server: ShutdownServer;
  disconnect: () => Promise<void>;
  logger: ShutdownLogger;
  signal?: string;
  drainTimeoutMs?: number;
  disconnectTimeoutMs?: number;
  forceExit?: (code: number) => void;
}

/** Stop accepting work, drain requests, then release the database pool exactly once. */
export function createGracefulShutdown(
  options: GracefulShutdownOptions,
): (signal?: string) => Promise<number> {
  let shutdownPromise: Promise<number> | undefined;

  return (signal = options.signal ?? 'unknown') => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      const drainTimeoutMs = options.drainTimeoutMs ?? 8_000;
      const disconnectTimeoutMs = options.disconnectTimeoutMs ?? 5_000;
      let exitCode = 0;
      options.logger.info('shutting down', { signal });

      let drainTimer: ReturnType<typeof setTimeout> | undefined;
      const closeResult = new Promise<{ timedOut: boolean; error?: Error | undefined }>(
        (resolve) => {
          drainTimer = setTimeout(() => resolve({ timedOut: true }), drainTimeoutMs);
          options.server.close((error) => resolve({ timedOut: false, error }));
        },
      );
      const drained = await closeResult;
      if (drainTimer) clearTimeout(drainTimer);

      if (drained.timedOut) {
        exitCode = 1;
        options.logger.warn('http drain timed out; closing remaining connections');
        options.server.closeAllConnections?.();
      } else if (drained.error) {
        exitCode = 1;
        options.logger.error('http server close failed');
      }

      let disconnectTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const disconnected = await Promise.race([
          options.disconnect().then(() => true),
          new Promise<false>((resolve) => {
            disconnectTimer = setTimeout(() => resolve(false), disconnectTimeoutMs);
          }),
        ]);
        if (!disconnected) {
          exitCode = 1;
          options.logger.error('database disconnect timed out');
          options.forceExit?.(1);
        }
      } catch {
        exitCode = 1;
        options.logger.error('database disconnect failed');
      } finally {
        if (disconnectTimer) clearTimeout(disconnectTimer);
      }

      options.logger.info('shutdown complete', { exitCode });
      return exitCode;
    })();

    return shutdownPromise;
  };
}
