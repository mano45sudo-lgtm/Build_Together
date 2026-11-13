import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';

/**
 * Assigns a request id (echoed on the `x-request-id` header + reused by the error handler and
 * access log so a failure is traceable end-to-end), then emits one structured access-log line
 * per response. Only non-secret metadata is logged — never bodies, tokens, or Authorization.
 */

/** Client-supplied ids are reused only if short and plain (UUIDs, trace ids); otherwise replaced. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function resolveRequestId(supplied: string | undefined): string {
  return supplied !== undefined && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID();
}

export function requestLog(req: Request, res: Response, next: NextFunction): void {
  const requestId = resolveRequestId(req.header('x-request-id'));
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
