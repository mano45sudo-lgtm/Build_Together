import { describe, expect, it } from 'vitest';
import { assertTestDatabaseIdentity, parseIsolatedTestDatabaseUrl } from './database-safety.js';

describe('test database safety', () => {
  it('accepts an explicitly isolated local test database', () => {
    const target = parseIsolatedTestDatabaseUrl(
      'postgresql://test_user:private_value@127.0.0.1:5432/cue_test',
    );
    expect(target.databaseName).toBe('cue_test');
  });

  it('rejects a missing explicit test URL instead of falling back to DATABASE_URL', () => {
    expect(() => parseIsolatedTestDatabaseUrl(undefined)).toThrow(/TEST_DATABASE_URL is required/);
  });

  it.each([
    'postgresql://user:secret@127.0.0.1:5432/buildtogether',
    'postgresql://user:secret@127.0.0.1:5432/cue_development_test',
    'postgresql://user:secret@db.example.com:5432/cue_test',
    'mysql://user:secret@127.0.0.1:3306/cue_test',
    'not-a-url',
  ])('rejects unsafe database configuration without disclosing credentials', (value) => {
    let error: unknown;
    try {
      parseIsolatedTestDatabaseUrl(value);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('secret');
    expect((error as Error).message).not.toContain(value);
  });

  it('refuses cleanup when the connected database name differs from the configured test name', () => {
    expect(() => assertTestDatabaseIdentity('cue_test', 'buildtogether')).toThrow(
      /does not match the isolated test database/,
    );
  });
});
