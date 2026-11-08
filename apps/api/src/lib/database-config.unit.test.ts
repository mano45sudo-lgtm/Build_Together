import { describe, expect, it } from 'vitest';
import {
  loadDatabaseSettings,
  resolveDatabaseConnectionString,
  resolveMigrationConnectionString,
} from './database-config.js';

describe('database configuration', () => {
  it('uses bounded conservative pool defaults for local development', () => {
    expect(loadDatabaseSettings('development', {})).toEqual({
      poolMax: 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      sslMode: 'disable',
      sslRootCert: undefined,
    });
  });

  it('rejects invalid pool bounds without echoing values', () => {
    expect(() => loadDatabaseSettings('test', { DATABASE_POOL_MAX: '999' })).toThrow(
      'DATABASE_POOL_MAX must be an integer between 1 and 20',
    );
    try {
      loadDatabaseSettings('test', { DATABASE_POOL_MAX: 'secret-value' });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain('secret-value');
      return;
    }
    throw new Error('expected invalid value to be rejected');
  });

  it('requires verified TLS in production', () => {
    expect(() => loadDatabaseSettings('production', {})).toThrow(/verify-full/);
    expect(loadDatabaseSettings('production', { DATABASE_SSL_MODE: 'verify-full' }).sslMode).toBe(
      'verify-full',
    );
    expect(() =>
      loadDatabaseSettings('production', {
        DATABASE_SSL_MODE: 'verify-full',
        DATABASE_SSL_ROOT_CERT:
          process.platform === 'win32' ? 'C:\\certs\\ca.pem' : '/etc/ssl/ca.pem',
      }),
    ).not.toThrow();
    expect(() =>
      loadDatabaseSettings('test', {
        DATABASE_SSL_MODE: 'verify-full',
        DATABASE_SSL_ROOT_CERT: 'relative-ca.pem',
      }),
    ).toThrow(/absolute file path/);
  });

  it('makes the environment-selected TLS mode authoritative for the URL', () => {
    const verified = new URL(
      resolveDatabaseConnectionString('postgresql://user:pass@db.example/app?sslmode=require', {
        sslMode: 'verify-full',
      }),
    );
    expect(verified.searchParams.get('sslmode')).toBe('verify-full');

    const local = new URL(
      resolveDatabaseConnectionString('postgresql://user:pass@localhost/app?sslmode=verify-full', {
        sslMode: 'disable',
      }),
    );
    expect(local.searchParams.get('sslmode')).toBe('disable');
  });

  describe('Prisma CLI (schema engine) connection string', () => {
    const raw = 'postgresql://user:pass@db.internal:5432/cue?sslmode=prefer&sslrootcert=/x.crt';

    it('translates verify-full into the engine strict mode with the CA as sslcert', () => {
      const url = new URL(
        resolveMigrationConnectionString(raw, {
          sslMode: 'verify-full',
          sslRootCert: '/etc/cue/db-ca.crt',
        }),
      );
      expect(url.searchParams.get('sslmode')).toBe('require');
      expect(url.searchParams.get('sslaccept')).toBe('strict');
      expect(url.searchParams.get('sslcert')).toBe('/etc/cue/db-ca.crt');
      expect(url.searchParams.has('sslrootcert')).toBe(false);
      expect(url.hostname).toBe('db.internal');
    });

    it('keeps strict verification against the system trust store when no CA is configured', () => {
      const url = new URL(resolveMigrationConnectionString(raw, { sslMode: 'verify-full' }));
      expect(url.searchParams.get('sslaccept')).toBe('strict');
      expect(url.searchParams.has('sslcert')).toBe(false);
      expect(url.searchParams.has('sslrootcert')).toBe(false);
    });

    it('never produces an unverified mode for verify-full', () => {
      const url = new URL(resolveMigrationConnectionString(raw, { sslMode: 'verify-full' }));
      expect(url.searchParams.get('sslaccept')).not.toBe('accept_invalid_certs');
      expect(url.searchParams.get('sslmode')).not.toBe('prefer');
    });

    it('leaves local disable mode unchanged and the runtime resolver untouched', () => {
      expect(resolveMigrationConnectionString(raw, { sslMode: 'disable' })).toBe(
        resolveDatabaseConnectionString(raw, { sslMode: 'disable' }),
      );
      const runtime = new URL(resolveDatabaseConnectionString(raw, { sslMode: 'verify-full' }));
      expect(runtime.searchParams.get('sslmode')).toBe('verify-full');
    });

    it('still rejects client-certificate input and non-PostgreSQL URLs', () => {
      expect(() =>
        resolveMigrationConnectionString('postgresql://u@h/db?sslcert=/c.pem', {
          sslMode: 'verify-full',
        }),
      ).toThrow(/client-certificate/);
      expect(() =>
        resolveMigrationConnectionString('mysql://u@h/db', { sslMode: 'disable' }),
      ).toThrow(/PostgreSQL/);
    });
  });
});
