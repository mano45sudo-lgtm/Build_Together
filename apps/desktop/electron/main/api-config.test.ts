import { describe, expect, it } from 'vitest';
import {
  DEVELOPMENT_API_BASE_URL,
  isNonPublicHostname,
  resolveApiBaseUrlFor,
  validateDevelopmentApiBaseUrl,
  validateProductionApiBaseUrl,
} from './api-config';

describe('validateDevelopmentApiBaseUrl', () => {
  it('defaults to the local API when unset or blank', () => {
    expect(validateDevelopmentApiBaseUrl(undefined)).toBe(DEVELOPMENT_API_BASE_URL);
    expect(validateDevelopmentApiBaseUrl('   ')).toBe('http://localhost:4000');
  });

  it.each([
    ['http://localhost:4000', 'http://localhost:4000'],
    ['http://127.0.0.1:4000/', 'http://127.0.0.1:4000'],
    ['https://api.example.com', 'https://api.example.com'],
  ])('accepts %s', (input, expected) => {
    expect(validateDevelopmentApiBaseUrl(input)).toBe(expected);
  });

  it.each([
    'localhost:4000',
    'ftp://localhost:4000',
    'http://localhost:4000/api',
    'http://user:pass@localhost:4000',
    'http://localhost:4000?x=1',
  ])('rejects malformed origin %s', (input) => {
    expect(() => validateDevelopmentApiBaseUrl(input)).toThrow(/BT_API_BASE_URL/);
  });
});

describe('validateProductionApiBaseUrl', () => {
  it('requires a value and says where to set it', () => {
    expect(() => validateProductionApiBaseUrl(undefined)).toThrow(/required.*\.env\.production/);
    expect(() => validateProductionApiBaseUrl('')).toThrow(/required/);
  });

  it('accepts a public https origin and normalizes the trailing slash', () => {
    expect(validateProductionApiBaseUrl('https://api.example.com/')).toBe(
      'https://api.example.com',
    );
    expect(validateProductionApiBaseUrl('https://api.example.com:8443')).toBe(
      'https://api.example.com:8443',
    );
  });

  it.each([
    'http://api.example.com',
    'http://localhost:4000',
    'https://localhost',
    'https://app.localhost',
    'https://127.0.0.1',
    'https://127.1.2.3',
    'https://10.0.0.5',
    'https://172.16.0.1',
    'https://192.168.1.10',
    'https://169.254.1.1',
    'https://0.0.0.0',
    'https://[::1]',
    'https://api.internal',
    'https://printer.local',
    'https://api.example.com/path',
    'https://user:pass@api.example.com',
    'https://api.example.com/#frag',
  ])('rejects %s', (input) => {
    expect(() => validateProductionApiBaseUrl(input)).toThrow(/BT_API_BASE_URL/);
  });
});

describe('resolveApiBaseUrlFor', () => {
  it('keeps the environments separate', () => {
    expect(resolveApiBaseUrlFor('development', 'http://localhost:4000')).toBe(
      'http://localhost:4000',
    );
    expect(() => resolveApiBaseUrlFor('production', 'http://localhost:4000')).toThrow();
    expect(() => resolveApiBaseUrlFor('production', undefined)).toThrow(/required/);
  });
});

describe('isNonPublicHostname', () => {
  it('does not flag public hosts that merely look similar', () => {
    for (const host of ['api.example.com', '172.32.0.1', '192.169.0.1', 'localhost.example.com']) {
      expect(isNonPublicHostname(host)).toBe(false);
    }
  });
});
