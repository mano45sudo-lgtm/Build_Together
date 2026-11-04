import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';

/**
 * Assigns a request id (echoed on the `x-request-id` header + reused by the error handler and
 * access log so a failure is traceable end-to-end), then emits one structured access-log line
 * per response. Only non-secret metadata is logged — never bodies, tokens, or Authorization.
 */
export function requestLog(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.header('x-request-id') ?? randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info('request', {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
}
