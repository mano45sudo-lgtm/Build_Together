import { validateClerkProductionConfiguration } from './clerk-env.js';
import {
  resolveCorsOrigin,
  resolvePublicAppBaseUrl,
  validateNexconnApiDomain,
} from './config-validation.js';
import { loadDatabaseSettings, type DatabaseSslMode } from './database-config.js';
import { resolveRuntimeEnvironment, type RuntimeEnvironment } from './runtime-environment.js';

/**
 * Environment configuration for the API. Loads and validates `process.env` once, at boot,
 * and fails fast on missing required values. Secrets live only here (server-side).
 *
 * DATABASE_URL is always required. NODE_ENV must be development (default), test or production
 * (runtime-environment.ts); every production guard below keys off the validated value.
 */

function str(key: string, fallback?: string): string | undefined {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v;
}

function int(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  if (!/^\d+$/.test(v.trim())) throw new Error(`Invalid integer for env var ${key}`);
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error(`Invalid integer for env var ${key}`);
  return n;
}

/** Comma-separated list → trimmed, non-empty entries; `undefined` when unset/empty. */
function parseCsv(key: string): string[] | undefined {
  const v = process.env[key];
  if (v === undefined || v === '') return undefined;
  const items = v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  return items.length > 0 ? items : undefined;
}

export interface Env {
  nodeEnv: RuntimeEnvironment;
  port: number;
  /** Single allowed browser origin; `undefined` in production means no CORS headers at all. */
  corsOrigin?: string | undefined;
  trustProxyHops: number;
  databaseUrl: string;
  databasePoolMax: number;
  databaseConnectionTimeoutMillis: number;
  databaseIdleTimeoutMillis: number;
  databaseSslMode: DatabaseSslMode;
  databaseSslRootCert?: string | undefined;
  invitationTtlSeconds: number;
  authRateLimit: number;
  inviteRateLimit: number;
  chatRateLimit: number;
  intelligenceRateLimit: number;
  /** Development invitation-link base; always `undefined` in production (see config-validation). */
  publicAppBaseUrl?: string | undefined;
  // Clerk (ADR-0006). Authentication is delegated to Clerk; the API only VERIFIES Clerk session
  // tokens and resolves the internal identity. Verification is possible two ways and BOTH are
  // optional in dev/test so the rest of the API boots without Clerk credentials (the `authenticate`
  // middleware then fails closed with 401 for every request). `clerkJwtKey` (a PEM public key) is
  // the networkless path — preferred in production because it never leaves the server. `clerkSecretKey`
  // is the remote JWKS path and additionally powers first-login profile provisioning via the Backend
  // API. The Secret Key is SERVER-ONLY and never belongs in a client bundle.
  clerkJwtKey?: string | undefined;
  clerkSecretKey?: string | undefined;
  clerkIssuer?: string | undefined;
  clerkAuthorizedParties?: string[] | undefined;
  clerkAudience?: string | undefined;
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
  const nodeEnv = resolveRuntimeEnvironment(process.env.NODE_ENV);
  const corsOrigin = resolveCorsOrigin(process.env.CORS_ORIGIN, nodeEnv);
  const trustProxyHops = int('TRUST_PROXY_HOPS', nodeEnv === 'production' ? -1 : 0);
  if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
    throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 10');
  }
  if (nodeEnv === 'production' && process.env.TRUST_PROXY_HOPS === undefined) {
    throw new Error('TRUST_PROXY_HOPS must be explicitly configured in production');
  }
  const databaseSettings = loadDatabaseSettings(nodeEnv);
  const env: Env = {
    nodeEnv,
    port: int('PORT', 4000),
    corsOrigin,
    trustProxyHops,
    databaseUrl: requireEnv('DATABASE_URL'),
    databasePoolMax: databaseSettings.poolMax,
    databaseConnectionTimeoutMillis: databaseSettings.connectionTimeoutMillis,
    databaseIdleTimeoutMillis: databaseSettings.idleTimeoutMillis,
    databaseSslMode: databaseSettings.sslMode,
    databaseSslRootCert: databaseSettings.sslRootCert,
    invitationTtlSeconds: int('INVITATION_TTL_SECONDS', 604800),
    authRateLimit: int('AUTH_RATE_LIMIT', 10),
    inviteRateLimit: int('INVITE_RATE_LIMIT', 30),
    chatRateLimit: int('CHAT_RATE_LIMIT', 60),
    intelligenceRateLimit: int('INTELLIGENCE_RATE_LIMIT', 120),
    publicAppBaseUrl: resolvePublicAppBaseUrl(process.env.PUBLIC_APP_BASE_URL, nodeEnv),
    clerkJwtKey: str('CLERK_JWT_KEY'),
    clerkSecretKey: str('CLERK_SECRET_KEY'),
    clerkIssuer: str('CLERK_JWT_ISSUER'),
    clerkAuthorizedParties: parseCsv('CLERK_AUTHORIZED_PARTIES'),
    clerkAudience: str('CLERK_JWT_AUDIENCE'),
    nexconnAppKey: str('NEXCONN_APP_KEY'),
    nexconnAppSecret: str('NEXCONN_APP_SECRET'),
    nexconnPrimaryApiDomain: validateNexconnApiDomain(
      'NEXCONN_PRIMARY_API_DOMAIN',
      process.env.NEXCONN_PRIMARY_API_DOMAIN,
      nodeEnv,
    ),
    nexconnSecondaryApiDomain: validateNexconnApiDomain(
      'NEXCONN_SECONDARY_API_DOMAIN',
      process.env.NEXCONN_SECONDARY_API_DOMAIN,
      nodeEnv,
    ),
    nexconnTokenTtlSeconds: int('NEXCONN_TOKEN_TTL_SECONDS', 3600),
    nexconnWebhookMaxSkewMs: int('NEXCONN_WEBHOOK_MAX_SKEW_MS', 300000),
  };

  validateClerkProductionConfiguration(env);
  const nexconnValues = [
    env.nexconnAppKey,
    env.nexconnAppSecret,
    env.nexconnPrimaryApiDomain,
    env.nexconnSecondaryApiDomain,
  ];
  if (nexconnValues.some(Boolean) && nexconnValues.some((value) => !value)) {
    throw new Error(
      'NEXCONN_APP_KEY, NEXCONN_APP_SECRET, NEXCONN_PRIMARY_API_DOMAIN and NEXCONN_SECONDARY_API_DOMAIN must be configured together',
    );
  }
  return env;
}

/** Process-wide resolved env (loaded once at boot; see backend-engineering skill). */
export const env = loadEnv();
