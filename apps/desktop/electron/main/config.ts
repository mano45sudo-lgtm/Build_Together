import { app } from 'electron';
import type { DesktopConfig } from '@buildtogether/shared';

/**
 * Environment-aware configuration for the desktop app.
 *
 * The renderer must NEVER depend on a hardcoded localhost production URL. The API base
 * is resolved here in the trusted main process and handed to the renderer over the typed
 * preload bridge. Precedence:
 *   1. Explicit `BT_API_BASE_URL` (dev/staging/prod override — set per environment).
 *   2. Unpackaged development build -> local dev API.
 *   3. Packaged build -> production API (never localhost).
 */
const DEV_API_BASE_URL = 'http://localhost:4000';
const PROD_API_BASE_URL = 'https://api.buildtogether.app';

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export function isDev(): boolean {
  // Packaged builds are always production. For an unpackaged build we default to dev, unless
  // BT_PROD=1 forces the production code path (custom app:// protocol + strict CSP) so it can
  // be smoke-tested from the built `out/` bundle without a full installer.
  return !app.isPackaged && process.env.BT_PROD !== '1';
}

export function resolveApiBaseUrl(): string {
  const explicit = process.env.BT_API_BASE_URL;
  if (explicit && explicit.trim().length > 0) return normalizeBaseUrl(explicit);
  return isDev() ? DEV_API_BASE_URL : PROD_API_BASE_URL;
}

export function resolveDesktopConfig(): DesktopConfig {
  return {
    apiBaseUrl: resolveApiBaseUrl(),
    appVersion: app.getVersion(),
    platform: process.platform,
  };
}

/** Origin the renderer is served from — used to validate IPC senders. */
export function trustedRendererOrigin(): string {
  return isDev() ? 'http://localhost:5173' : 'app://bundle';
}
