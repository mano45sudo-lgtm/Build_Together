import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { ApiResponse, HealthReport } from '@buildtogether/shared';
import { uptimeSeconds } from './lib/logger.js';

/**
 * Express application factory. Testable (no `listen()` here). Phase 0 registers only a
 * health probe; feature routes/middleware (auth, workspaceScope, validate) are added in
 * later phases under /api/v1 per the backend-engineering skill.
 */
export function createApp(): Express {
  const app = express();

  app.use(express.json({ limit: '128kb' }));

  // Health probe — proves the server, routing, and the shared response envelope work.
  app.get('/api/v1/health', (_req: Request, res: Response) => {
    const body: ApiResponse<HealthReport> = {
      data: { status: 'ok', service: '@buildtogether/api', uptimeSeconds: uptimeSeconds() },
      error: null,
    };
    res.status(200).json(body);
  });

  // 404 → standard envelope.
  app.use((req: Request, res: Response, _next: NextFunction) => {
    const body: ApiResponse<null> = {
      data: null,
      error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
    };
    res.status(404).json(body);
  });

  // Centralized error handler (last in the chain). Never leak internals to the client.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    const message = err instanceof Error ? err.message : 'Unexpected error';
    const body: ApiResponse<null> = {
      data: null,
      error: { code: 'INTERNAL_ERROR', message },
    };
    res.status(500).json(body);
  });

  return app;
}
