import type { ApiResponse } from '@buildtogether/shared';
import type { Response } from 'express';

/**
 * Response-envelope helpers. Every controller emits `{ data, error, meta }` so the desktop
 * renderer and the API never disagree on shape (shared contract). Success sets `error: null`.
 */
export function sendEnvelope<T>(res: Response, status: number, body: ApiResponse<T>): void {
  res.status(status).json(body);
}

export function ok<T>(res: Response, data: T, meta?: ApiResponse<T>['meta']): void {
  sendEnvelope(res, 200, { data, error: null, ...(meta ? { meta } : {}) });
}

export function created<T>(res: Response, data: T, meta?: ApiResponse<T>['meta']): void {
  sendEnvelope(res, 201, { data, error: null, ...(meta ? { meta } : {}) });
}
