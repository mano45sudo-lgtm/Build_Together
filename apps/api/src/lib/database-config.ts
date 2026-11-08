import { isAbsolute } from 'node:path';

export type DatabaseSslMode = 'disable' | 'verify-full';

export interface DatabaseSettings {
  poolMax: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  sslMode: DatabaseSslMode;
  sslRootCert?: string | undefined;
}

interface IntegerSetting {
  key: string;
  fallback: number;
  minimum: number;
  maximum: number;
}

function positiveBoundedInteger(source: NodeJS.ProcessEnv, setting: IntegerSetting): number {
  const value = source[setting.key];
  if (value === undefined || value.trim() === '') return setting.fallback;
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(
      `${setting.key} must be an integer between ${setting.minimum} and ${setting.maximum}`,
    );
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < setting.minimum || parsed > setting.maximum) {
    throw new Error(
      `${setting.key} must be an integer between ${setting.minimum} and ${setting.maximum}`,
    );
  }
  return parsed;
}

/** Parse bounded adapter settings without ever including URL or credential values in errors. */
export function loadDatabaseSettings(
  nodeEnv: string,
  source: NodeJS.ProcessEnv = process.env,
): DatabaseSettings {
  const poolMax = positiveBoundedInteger(source, {
    key: 'DATABASE_POOL_MAX',
    fallback: 5,
    minimum: 1,
    maximum: 20,
  });
  const connectionTimeoutMillis = positiveBoundedInteger(source, {
    key: 'DATABASE_CONNECTION_TIMEOUT_MS',
    fallback: 5_000,
    minimum: 100,
    maximum: 30_000,
  });
  const idleTimeoutMillis = positiveBoundedInteger(source, {
    key: 'DATABASE_IDLE_TIMEOUT_MS',
    fallback: 10_000,
    minimum: 1_000,
    maximum: 300_000,
  });

  const rawSslMode = source.DATABASE_SSL_MODE?.trim();
  if (nodeEnv === 'production' && !rawSslMode) {
    throw new Error('DATABASE_SSL_MODE must be set to verify-full in production');
  }
  const sslMode = (rawSslMode || 'disable') as DatabaseSslMode;
  if (sslMode !== 'disable' && sslMode !== 'verify-full') {
    throw new Error('DATABASE_SSL_MODE must be either disable or verify-full');
  }
  if (nodeEnv === 'production' && sslMode !== 'verify-full') {
    throw new Error('DATABASE_SSL_MODE must be verify-full in production');
  }

  const sslRootCert = source.DATABASE_SSL_ROOT_CERT?.trim() || undefined;
  if (sslRootCert && sslMode !== 'verify-full') {
    throw new Error('DATABASE_SSL_ROOT_CERT requires DATABASE_SSL_MODE=verify-full');
  }
  if (sslRootCert && !isAbsolute(sslRootCert)) {
    throw new Error('DATABASE_SSL_ROOT_CERT must be an absolute file path');
  }

  return {
    poolMax,
    connectionTimeoutMillis,
    idleTimeoutMillis,
    sslMode,
    sslRootCert,
  };
}

/**
 * Make the environment settings authoritative for both Prisma Migrate and the runtime `pg` pool.
 * The installed node-postgres parser reads `sslrootcert` from a file and verifies the host for
 * `verify-full`. Client-certificate URL parameters need a separate, reviewed mTLS design.
 */
export function resolveDatabaseConnectionString(
  rawUrl: string,
  settings: Pick<DatabaseSettings, 'sslMode' | 'sslRootCert'>,
): string {
  if (!rawUrl) return '';

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use PostgreSQL');
  }

  const unsupportedTlsParameters = ['sslcert', 'sslkey', 'sslpassword', 'sslnegotiation'];
  if (unsupportedTlsParameters.some((key) => url.searchParams.has(key))) {
    throw new Error(
      'DATABASE_URL client-certificate options are not supported; use the reviewed database TLS configuration',
    );
  }

  // Avoid pg's URL parser silently replacing a PoolConfig ssl object with connection-string fields.
  url.searchParams.delete('ssl');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');

  if (settings.sslMode === 'disable') {
    url.searchParams.delete('sslrootcert');
    url.searchParams.set('sslmode', 'disable');
  } else {
    url.searchParams.set('sslmode', 'verify-full');
    if (settings.sslRootCert) url.searchParams.set('sslrootcert', settings.sslRootCert);
  }

  return url.toString();
}

/**
 * Connection string for the Prisma CLI (`migrate deploy`, `migrate status`, `migrate diff`).
 *
 * The CLI's Rust schema engine does not implement libpq's `sslmode=verify-full`/`sslrootcert`: in a
 * measured test against a TLS-only server it connected with no CA file and to a hostname absent
 * from the certificate, i.e. encrypted but unauthenticated. Its own strict mode does verify both
 * chain and hostname, so `verify-full` is translated to `sslmode=require&sslaccept=strict` with the
 * CA passed as Prisma's `sslcert` (a root certificate here, not a client certificate). Without a
 * configured CA, strict mode uses the system trust store. The runtime `pg` pool keeps
 * {@link resolveDatabaseConnectionString}.
 */
export function resolveMigrationConnectionString(
  rawUrl: string,
  settings: Pick<DatabaseSettings, 'sslMode' | 'sslRootCert'>,
): string {
  const resolved = resolveDatabaseConnectionString(rawUrl, settings);
  if (!resolved || settings.sslMode === 'disable') return resolved;

  const url = new URL(resolved);
  url.searchParams.delete('sslrootcert');
  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('sslaccept', 'strict');
  if (settings.sslRootCert) url.searchParams.set('sslcert', settings.sslRootCert);
  return url.toString();
}
