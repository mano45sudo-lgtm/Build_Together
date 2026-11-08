/**
 * API endpoint validation for the Electron main process. The endpoint is embedded at build time
 * (`CUE_API_BASE_URL`) and re-validated at runtime, so a bundle built for one environment can never
 * silently talk to another. Development and production rules are deliberately separate functions:
 * loosening development must never be able to loosen production.
 */

export type BuildEnvironment = 'development' | 'production';

/** Default local API used when a development build does not configure one. */
export const DEVELOPMENT_API_BASE_URL = 'http://localhost:4000';

const VARIABLE = 'BT_API_BASE_URL';

/** Parse an absolute URL that is a bare origin: no credentials, path, query or fragment. */
function parseOrigin(raw: string, allowedProtocols: readonly string[]): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${VARIABLE} must be an absolute URL origin, e.g. https://api.example.com`);
  }
  if (!allowedProtocols.includes(url.protocol)) {
    throw new Error(`${VARIABLE} must use ${allowedProtocols.join(' or ')} (got ${url.protocol})`);
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error(`${VARIABLE} must be an origin without credentials, path, query, or fragment`);
  }
  return url;
}

/** Hostnames that only resolve on the local machine or a private network. */
export function isNonPublicHostname(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (
    host === '::' ||
    host === '::1' ||
    /^f[cd][0-9a-f]{2}:/.test(host) ||
    host.startsWith('fe80:')
  ) {
    return true;
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!ipv4) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return (
    a === 0 || // "this" network
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) // private
  );
}

/** Development: local HTTP is expected (local API + Docker PostgreSQL); HTTPS also allowed. */
export function validateDevelopmentApiBaseUrl(configured: string | undefined): string {
  const raw = configured?.trim();
  if (!raw) return DEVELOPMENT_API_BASE_URL;
  return parseOrigin(raw, ['http:', 'https:']).origin;
}

/** Production: required, HTTPS only, and a publicly routable host. Never relaxed. */
export function validateProductionApiBaseUrl(configured: string | undefined): string {
  const raw = configured?.trim();
  if (!raw) {
    throw new Error(
      `${VARIABLE} is required for a production desktop build. Set it to the deployed API's ` +
        'HTTPS origin in apps/desktop/.env.production or the build environment.',
    );
  }
  const url = parseOrigin(raw, ['https:']);
  if (isNonPublicHostname(url.hostname)) {
    throw new Error(
      `${VARIABLE} must be a public HTTPS origin in production (got ${url.hostname})`,
    );
  }
  return url.origin;
}

export function resolveApiBaseUrlFor(
  environment: BuildEnvironment,
  configured: string | undefined,
): string {
  return environment === 'production'
    ? validateProductionApiBaseUrl(configured)
    : validateDevelopmentApiBaseUrl(configured);
}
