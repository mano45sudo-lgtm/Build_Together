import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { badRequest } from '../errors/app-error.js';

/**
 * Validates `req.body` against a zod schema and replaces it with the parsed (trimmed,
 * normalized, typed) value. On failure it throws a 400 AppError carrying field-level details
 * that the shared error envelope relays to the client. Validation lives at the route edge —
 * services always receive clean, typed input.
 */
export function validate<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        (details[key] ??= []).push(issue.message);
      }
      throw badRequest('VALIDATION_FAILED', 'Request validation failed', details);
    }
    req.body = result.data;
    next();
  };
}

/**
 * Like `validate`, but for the query string. On success it attaches the parsed value to
 * `req.validatedQuery` (leaving `req.query` untouched) so controllers read typed, coerced, bounded
 * filter/sort/pagination params instead of raw strings. Failures return the same field-level 400.
 */
export function validateQuery<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const details: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        (details[key] ??= []).push(issue.message);
      }
      throw badRequest('VALIDATION_FAILED', 'Invalid query parameters', details);
    }
    req.validatedQuery = result.data;
    next();
  };
}
