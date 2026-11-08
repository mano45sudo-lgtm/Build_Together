// Must be the first import: it loads apps/api/.env into process.env before `lib/env.ts`
// (pulled in via app.js below) validates configuration eagerly at module-evaluation time.
import './lib/load-env-file.js';
import { createApp } from './app.js';
import { loadEnv } from './lib/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { createGracefulShutdown } from './lib/graceful-shutdown.js';

const env = loadEnv();
const app = createApp();

const server = app.listen(env.port, () => {
  logger.info('api listening', { port: env.port, env: env.nodeEnv });
});

const shutdownGracefully = createGracefulShutdown({
  server,
  disconnect: () => prisma.$disconnect(),
  logger,
  forceExit: (code) => process.exit(code),
});

function shutdown(signal: string): void {
  void shutdownGracefully(signal).then((code) => {
    if (code !== 0) process.exitCode = code;
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
