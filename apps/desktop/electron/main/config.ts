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

/** Origin the renderer is served from — used to validate IPC senders and to shape the dev CSP. */
export function trustedRendererOrigin(): string {
  if (!isDev()) return 'app://bundle';
  // electron-vite injects the actual dev URL. If 5173 is already in use it silently falls through to
  // 5174+; hardcoding 5173 here rejected every IPC call as `untrusted IPC sender` in that case and
  // also leaked the wrong origin into the CSP `connect-src`. Derive from env, fall back to the
  // conventional port only when the env is absent.
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    try {
      return new URL(devUrl).origin;
    } catch {
      // Malformed env value: fall through to the default rather than refuse every IPC call.
    }
  }
  return 'http://localhost:5173';
}
