// Must be the first import: it loads apps/api/.env into process.env before `lib/env.ts`
// (pulled in via app.js below) validates configuration eagerly at module-evaluation time.
import './lib/load-env-file.js';
import { createApp } from './app.js';
import { loadEnv } from './lib/env.js';
import { logger } from './lib/logger.js';

const env = loadEnv();
const app = createApp();

const server = app.listen(env.port, () => {
  logger.info('api listening', { port: env.port, env: env.nodeEnv });
});

function shutdown(signal: string): void {
  logger.info('shutting down', { signal });
  server.close(() => process.exit(0));
  // Force-exit if connections hang.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
