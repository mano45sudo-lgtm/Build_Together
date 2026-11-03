import type { ApiResponse, HealthReport } from '@buildtogether/shared';
import { resolveApiBaseUrl } from './config';

export type ApiCallResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Minimal typed API client for the renderer. Demonstrates the secure renderer -> remote-API
 * path (over HTTPS, base URL resolved environment-aware) and models loading/error/empty
 * states the frontend skill requires. Only the health endpoint exists in Phase 1.
 */
export async function fetchHealth(): Promise<ApiCallResult<HealthReport>> {
  const base = await resolveApiBaseUrl();
  try {
    const response = await fetch(`${base}/api/v1/health`, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    const body = (await response.json()) as ApiResponse<HealthReport>;
    if (!response.ok || body.error) {
      return { ok: false, error: body.error?.message ?? `Request failed (${response.status})` };
    }
    if (!body.data) {
      return { ok: false, error: 'Empty response from API' };
    }
    return { ok: true, data: body.data };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Network request failed',
    };
  }
}
