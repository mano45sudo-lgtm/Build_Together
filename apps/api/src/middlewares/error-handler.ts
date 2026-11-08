import type { ApiResponse } from '@buildtogether/shared';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import { logger } from '../lib/logger.js';

/**
 * Central error handler — the last middleware in the chain. Translates a thrown AppError into
 * the shared envelope with its own status/code, and maps anything unexpected to a generic 500.
 * Stack traces and internal messages are logged server-side (with the request id) but NEVER
 * returned to the client, so no SQL, secret, or dependency detail leaks.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction, // unused; Express identifies error middleware by arity.
): void {
  const requestId = req.requestId;

  if (err instanceof AppError) {
    // 4xx/5xx domain failures are expected; log at warn, drop the client to the safe message.
    logger.warn('request error', {
      requestId,
      code: err.code,
      status: err.statusCode,
      path: req.path,
    });
    const body: ApiResponse<null> = {
      data: null,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // Error messages can contain SQL/provider detail or credentials; log only the class name.
  logger.error('unhandled error', {
    requestId,
    path: req.path,
    errorType: err instanceof Error ? err.name : 'UnknownError',
  });
  const body: ApiResponse<null> = {
    data: null,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  };
  res.status(500).json(body);
}
