import type { ErrorCode } from '@buildtogether/shared';

/**
 * Typed application error. Services throw these; a single error-handler translates them to
 * the response envelope. Stack traces, SQL and secrets never reach the client.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (
  code: ErrorCode,
  message: string,
  details?: Record<string, string[]>,
): AppError => new AppError(400, code, message, details);

export const unauthorized = (code: ErrorCode, message: string): AppError =>
  new AppError(401, code, message);

export const forbidden = (code: ErrorCode, message: string): AppError =>
  new AppError(403, code, message);

export const notFound = (code: ErrorCode, message: string): AppError =>
  new AppError(404, code, message);

export const conflict = (code: ErrorCode, message: string): AppError =>
  new AppError(409, code, message);

export const tooManyRequests = (code: ErrorCode, message: string): AppError =>
  new AppError(429, code, message);

export const serviceUnavailable = (code: ErrorCode, message: string): AppError =>
  new AppError(503, code, message);
