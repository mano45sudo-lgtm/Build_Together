import type { RuntimeEnvironment } from './runtime-environment.js';

/**
 * Pure validators for URL-shaped configuration. Error messages name the variable but never echo
 * its value.
 */

/** Origin of the packaged desktop renderer (privileged `app://bundle` scheme, electron/main/protocol.ts). */
export const DESKTOP_RENDERER_ORIGIN = 'app://bundle';

const DEV_RENDERER_ORIGIN = 'http://localhost:5173';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * `CORS_ORIGIN` is the single *browser* origin allowed to read API responses — never the API's own
 * hostname. The only browser caller today is the desktop renderer's API status check
 * (`apps/desktop/src/lib/apiClient.ts`), whose packaged origin is `app://bundle`; the Electron main
 * process makes every authenticated call server-side, without an Origin header, so CORS never
 * applies to it.
 *
 * Production: optional. Unset → no CORS headers at all (every cross-origin browser read is blocked;
 * non-browser clients are unaffected). Set → exactly `app://bundle` or an exact public `https`
 * origin. Wildcards, paths, localhost and credentials are never allowed.
 * Development/test: defaults to the Vite renderer origin, as before.
 */
export function resolveCorsOrigin(
  raw: string | undefined,
  environment: RuntimeEnvironment,
): string | undefined {
  const value = raw === '' ? undefined : raw;
  if (environment !== 'production') return value ?? DEV_RENDERER_ORIGIN;
  if (value === undefined) return undefined;
  if (value === DESKTOP_RENDERER_ORIGIN) return value;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      'CORS_ORIGIN must be app://bundle or an exact public HTTPS origin in production',
    );
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.origin !== value ||
    parsed.hostname.includes('*') ||
    LOOPBACK_HOSTS.has(parsed.hostname)
  ) {
    throw new Error(
      'CORS_ORIGIN must be app://bundle or an exact public HTTPS origin in production',
    );
  }
  return value;
}

/**
 * `PUBLIC_APP_BASE_URL` only builds the development invitation link
 * (`<base>/invite/accept?token=…`). Production has no page or deep link that serves that path,
 * so production never builds a URL and ignores the variable (returns `undefined`); invitations
 * are shared as the bare invite code, which the desktop "Join a workspace" field already accepts.
 */
export function resolvePublicAppBaseUrl(
  raw: string | undefined,
  environment: RuntimeEnvironment,
): string | undefined {
  if (environment === 'production') return undefined;
  return raw === undefined || raw === '' ? DEV_RENDERER_ORIGIN : raw;
}

/**
 * Nexconn API domains are base URLs: the SDK's `setPrimaryBackupDomains(primaryUrl, backupUrl)`
 * strips trailing slashes and prefixes every request path with them, so a bare hostname would
 * produce broken relative requests. Requires an absolute URL without credentials, query or
 * fragment; production additionally requires HTTPS. Unset stays `undefined` (chat disabled).
 */
export function validateNexconnApiDomain(
  key: 'NEXCONN_PRIMARY_API_DOMAIN' | 'NEXCONN_SECONDARY_API_DOMAIN',
  raw: string | undefined,
  environment: RuntimeEnvironment,
): string | undefined {
  if (raw === undefined || raw === '') return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${key} must be an absolute URL such as https://<nexconn-api-host>`);
  }
  const allowed = environment === 'production' ? ['https:'] : ['https:', 'http:'];
  if (!allowed.includes(parsed.protocol)) {
    throw new Error(`${key} must use ${environment === 'production' ? 'https' : 'http or https'}`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${key} must not contain credentials, a query or a fragment`);
  }
  return raw;
}
