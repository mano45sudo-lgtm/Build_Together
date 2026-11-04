/**
 * Environment configuration for the API. Loads and validates `process.env` once, at boot,
 * and fails fast on missing required values. Secrets live only here (server-side).
 *
 * Phase 2: DATABASE_URL is required (auth + workspaces are backed by PostgreSQL). A test
 * harness may set NODE_ENV=test to relax nothing here — the DB URL is still required.
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
  databaseUrl: string;
  sessionSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  invitationTtlSeconds: number;
  authRateLimit: number;
  inviteRateLimit: number;
  chatRateLimit: number;
  publicAppBaseUrl: string;
  // Nexconn (ADR-0004). Optional in dev/test so the rest of the API boots without chat
  // credentials; the chat module fails closed when they are absent. App Secret is server-only;
  // App Key is a public client identifier (also used for `init` on the client). Callback signature
  // = SHA1(AppSecret + nonce + timestamp) (verified: docs.rongcloud.io auth-callback).
  nexconnAppKey?: string | undefined;
  nexconnAppSecret?: string | undefined;
  nexconnPrimaryApiDomain?: string | undefined;
  nexconnSecondaryApiDomain?: string | undefined;
  nexconnTokenTtlSeconds: number;
  nexconnWebhookMaxSkewMs: number;
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return v;
}

export function loadEnv(): Env {
  const env: Env = {
    nodeEnv: str('NODE_ENV', 'development') as string,
    port: int('PORT', 4000),
    corsOrigin: str('CORS_ORIGIN', 'http://localhost:5173') as string,
    databaseUrl: requireEnv('DATABASE_URL'),
    sessionSecret: str('SESSION_SECRET', 'dev-only-insecure-secret') as string,
    accessTokenTtlSeconds: int('ACCESS_TOKEN_TTL_SECONDS', 900),
    refreshTokenTtlSeconds: int('REFRESH_TOKEN_TTL_SECONDS', 2592000),
    invitationTtlSeconds: int('INVITATION_TTL_SECONDS', 604800),
    authRateLimit: int('AUTH_RATE_LIMIT', 10),
    inviteRateLimit: int('INVITE_RATE_LIMIT', 30),
    chatRateLimit: int('CHAT_RATE_LIMIT', 60),
    publicAppBaseUrl: str('PUBLIC_APP_BASE_URL', 'http://localhost:5173') as string,
    nexconnAppKey: str('NEXCONN_APP_KEY'),
    nexconnAppSecret: str('NEXCONN_APP_SECRET'),
    nexconnPrimaryApiDomain: str('NEXCONN_PRIMARY_API_DOMAIN'),
    nexconnSecondaryApiDomain: str('NEXCONN_SECONDARY_API_DOMAIN'),
    nexconnTokenTtlSeconds: int('NEXCONN_TOKEN_TTL_SECONDS', 3600),
    nexconnWebhookMaxSkewMs: int('NEXCONN_WEBHOOK_MAX_SKEW_MS', 300000),
  };

  // Fail closed in production if an insecure default is still in place. Never log values.
  if (env.nodeEnv === 'production' && env.sessionSecret === 'dev-only-insecure-secret') {
    throw new Error('SESSION_SECRET must be set in production');
  }
  return env;
}

/** Process-wide resolved env (loaded once at boot; see backend-engineering skill). */
export const env = loadEnv();
