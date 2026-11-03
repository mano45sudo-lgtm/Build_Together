/**
 * Shared TypeScript contracts for BuildTogether.
 *
 * Both `@buildtogether/web` and `@buildtogether/api` compile against these shapes so the
 * API response format stays a single source of truth. This is intentionally just the
 * transport contract + a couple of common enums — NOT product domain models, which are
 * defined with the database in later phases.
 */

/** Machine-readable error code carried in a failed response. */
export type ErrorCode = string;

/** Standard error payload. Present exactly when `data` is null. */
export interface ApiError {
  code: ErrorCode;
  message: string;
  /** Optional field-level validation details. */
  details?: Record<string, string[]>;
}

/** Response metadata (tracing, pagination). */
export interface ApiMeta {
  requestId?: string;
  cursor?: string;
  limit?: number;
}

/**
 * The response envelope every BuildTogether API endpoint returns.
 * Success: `{ data, error: null }`. Failure: `{ data: null, error }`.
 */
export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  meta?: ApiMeta;
}

/** Narrowing helper for the web `apiClient`. */
export function isSuccess<T>(
  res: ApiResponse<T>,
): res is ApiResponse<T> & { data: T; error: null } {
  return res.error === null && res.data !== null;
}

/** Task lifecycle states referenced by the product plan (work phase). */
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';

/** Workspace-scoped roles (authorization phase). */
export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST';

/** Health probe shape shared between api and any consumer. */
export interface HealthReport {
  status: 'ok';
  service: string;
  uptimeSeconds: number;
}

// ---- Desktop (Electron) contracts ----
export * from './desktop';
