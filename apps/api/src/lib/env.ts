/**
 * Environment configuration for the API. Loads and validates `process.env` once, at boot,
 * and fails fast on missing required values. Secrets live only here (server-side).
 *
 * Phase 0: only boot-time vars are required. DATABASE_URL, SESSION_SECRET, NEXCONN_* and
 * AI_* become required in their respective phases — they are declared optional now so the
 * scaffold runs without unconfigured secrets.
 */

function str(key: string, fallback?: string): string | undefined {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v;
}

function int(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid number for env var ${key}: "${v}"`);
  }
  return n;
}

export interface Env {
  nodeEnv: string;
  port: number;
  corsOrigin: string;
  // Forward-looking (unused in Phase 0; validated when their phase lands):
  databaseUrl?: string | undefined;
  sessionSecret?: string | undefined;
  nexconnAppId?: string | undefined;
  nexconnAppSecret?: string | undefined;
}

export function loadEnv(): Env {
  const env: Env = {
    nodeEnv: str('NODE_ENV', 'development') as string,
    port: int('PORT', 4000),
    corsOrigin: str('CORS_ORIGIN', 'http://localhost:5173') as string,
    databaseUrl: str('DATABASE_URL'),
    sessionSecret: str('SESSION_SECRET'),
    nexconnAppId: str('NEXCONN_APP_ID'),
    nexconnAppSecret: str('NEXCONN_APP_SECRET'),
  };

  // Fail fast in production if a required secret is absent. Never log the values.
  if (env.nodeEnv === 'production' && !env.sessionSecret) {
    throw new Error('SESSION_SECRET is required in production');
  }
  return env;
}
