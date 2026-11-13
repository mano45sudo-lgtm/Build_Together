import { describe, expect, it } from 'vitest';
import {
  DESKTOP_RENDERER_ORIGIN,
  resolveCorsOrigin,
  resolvePublicAppBaseUrl,
  validateNexconnApiDomain,
} from './config-validation.js';

describe('resolveCorsOrigin', () => {
  it('keeps the Vite renderer default outside production', () => {
    expect(resolveCorsOrigin(undefined, 'development')).toBe('http://localhost:5173');
    expect(resolveCorsOrigin('', 'test')).toBe('http://localhost:5173');
    expect(resolveCorsOrigin('http://localhost:5174', 'development')).toBe('http://localhost:5174');
  });

  it('is optional in production: unset means no CORS origin at all (no permissive default)', () => {
    expect(resolveCorsOrigin(undefined, 'production')).toBeUndefined();
    expect(resolveCorsOrigin('', 'production')).toBeUndefined();
  });

  it('allows exactly the packaged desktop origin or a public https origin in production', () => {
    expect(resolveCorsOrigin(DESKTOP_RENDERER_ORIGIN, 'production')).toBe('app://bundle');
    expect(resolveCorsOrigin('https://app.example.com', 'production')).toBe(
      'https://app.example.com',
    );
  });

  it.each([
    '*',
    'https://*.example.com',
    'http://app.example.com',
    'https://localhost',
    'https://127.0.0.1',
    'https://app.example.com/',
    'https://app.example.com/path',
    'app://bundle/',
    'app://other',
    'not a url',
  ])('rejects %s in production', (value) => {
    expect(() => resolveCorsOrigin(value, 'production')).toThrow(/CORS_ORIGIN/);
  });
});

describe('resolvePublicAppBaseUrl', () => {
  it('keeps the localhost dev default outside production', () => {
    expect(resolvePublicAppBaseUrl(undefined, 'development')).toBe('http://localhost:5173');
    expect(resolvePublicAppBaseUrl('http://localhost:5174', 'test')).toBe('http://localhost:5174');
  });

  it('never yields a URL in production, even when the variable is set', () => {
    expect(resolvePublicAppBaseUrl(undefined, 'production')).toBeUndefined();
    expect(resolvePublicAppBaseUrl('http://localhost:5173', 'production')).toBeUndefined();
    expect(resolvePublicAppBaseUrl('https://app.example.com', 'production')).toBeUndefined();
  });
});

describe('validateNexconnApiDomain', () => {
  const key = 'NEXCONN_PRIMARY_API_DOMAIN' as const;

  it('leaves an unset domain unset (chat disabled)', () => {
    expect(validateNexconnApiDomain(key, undefined, 'production')).toBeUndefined();
    expect(validateNexconnApiDomain(key, '', 'production')).toBeUndefined();
  });

  it('accepts an absolute https base URL', () => {
    expect(validateNexconnApiDomain(key, 'https://api.example.com', 'production')).toBe(
      'https://api.example.com',
    );
  });

  it('allows http only outside production', () => {
    expect(validateNexconnApiDomain(key, 'http://mock.local', 'test')).toBe('http://mock.local');
    expect(() => validateNexconnApiDomain(key, 'http://api.example.com', 'production')).toThrow(
      /must use https/,
    );
  });

  it.each([
    'api.example.com',
    'ftp://api.example.com',
    'https://u:p@api.example.com',
    'https://api.example.com/?a=1',
    'https://api.example.com/#x',
  ])('rejects %s and names only the variable', (value) => {
    let message = '';
    try {
      validateNexconnApiDomain(key, value, 'production');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(key);
    expect(message).not.toContain(value);
  });
});
