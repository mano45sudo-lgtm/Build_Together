import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { ApiResponse, HealthReport } from '@buildtogether/shared';
import { errorHandler } from './middlewares/error-handler.js';
import { requestLog } from './middlewares/request-log.js';
import { env } from './lib/env.js';
import { uptimeSeconds } from './lib/logger.js';
import { checkDatabaseReadiness } from './lib/database-readiness.js';
import { v1Router } from './routes/v1.js';

/**
 * Express application factory. Testable (no `listen()` here). Middleware order is deliberate:
 * request-id/logging → CORS → body parsing → versioned feature routes → 404 → central error
 * handler LAST so anything thrown anywhere (sync or via asyncHandler) is normalized to the shared
 * envelope with no internal detail leaked.
 *
 * CORS is honored for the configured desktop origin. The Electron renderer never talks to the API
 * directly — the trusted main process does (server-side fetch is not browser-CORS-bound) — but we
 * set the headers anyway so a browser hit on the health/dev routes behaves predictably.
 */
export function createReadinessHandler(probe: () => Promise<void> = checkDatabaseReadiness) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      await probe();
      res.status(200).json({ data: { status: 'ready' }, error: null });
    } catch {
      res.status(503).json({
        data: null,
        error: { code: 'DATABASE_NOT_READY', message: 'Database is not ready' },
      });
    }
  };
}

export function createLivenessHandler() {
  return (_req: Request, res: Response): void => {
    const body: ApiResponse<HealthReport> = {
      data: { status: 'ok', service: '@buildtogether/api', uptimeSeconds: uptimeSeconds() },
      error: null,
    };
    res.status(200).json(body);
  };
}

export function createApp(options: { databaseReadiness?: () => Promise<void> } = {}): Express {
  const app = express();

  // Trust only the explicitly configured proxy hop count; never assume a topology.
  app.set('trust proxy', env.trustProxyHops);
  app.disable('x-powered-by');

  app.use(requestLog);

  // Minimal CORS (no extra dependency). Reflects the single configured origin; handles preflight.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.header('origin');
    if (origin && origin === env.corsOrigin) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'origin');
      res.setHeader('access-control-allow-headers', 'authorization,content-type,x-request-id');
      res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      res.setHeader('access-control-max-age', '600');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '128kb' }));

  // Health probe — proves the server, routing, and the shared response envelope work.
  app.get('/api/v1/health', createLivenessHandler());

  // Readiness is separate from liveness so the process can remain alive while the database
  // is unavailable and the platform can withhold traffic until the pool can answer a probe.
  app.get('/api/v1/health/ready', createReadinessHandler(options.databaseReadiness));

  // Versioned feature surface (auth, users, workspaces, members, invitations).
  app.use('/api/v1', v1Router);

  // 404 → standard envelope.
  app.use((req: Request, res: Response) => {
    const body: ApiResponse<null> = {
      data: null,
      error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
    };
    res.status(404).json(body);
  });

  // Centralized error handler (must be last; 4-arg signature is how Express detects it).
  app.use(errorHandler);

  return app;
}
