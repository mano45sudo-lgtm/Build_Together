import { performance } from 'node:perf_hooks';

type Level = 'info' | 'warn' | 'error' | 'debug';

/**
 * Minimal structured JSON logger. No console.log in committed code; the request id and
 * context are attached so entries are traceable. Secrets/PII must never be logged — redact
 * at call sites. A real logger (pino/winston) can replace this in a later phase without
 * changing call sites.
 */
function emit(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...fields });
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(line + '\n');
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
};

/** Seconds since process start, for the health probe. */
export function uptimeSeconds(): number {
  return Math.floor(performance.now() / 1000);
}
