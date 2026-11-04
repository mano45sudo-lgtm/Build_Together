/**
 * Shared TypeScript contracts for BuildTogether.
 *
 * `@buildtogether/desktop` (renderer + main IPC) and `@buildtogether/api` compile against
 * these shapes so the API response format and the domain model stay a single source of
 * truth. Transport contract + common enums live here; Phase 2 domain DTOs in `./domain`.
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

/** Health probe shape shared between api and any consumer. */
export interface HealthReport {
  status: 'ok';
  service: string;
  uptimeSeconds: number;
}

// ---- Desktop (Electron) contracts ----
export * from './desktop';

// ---- Phase 2 domain contracts (identity, workspaces, membership, invitations) ----
export * from './domain';

// ---- Phase 3 communication contracts (workspace-scoped chat over Nexconn) ----
export * from './chat';
