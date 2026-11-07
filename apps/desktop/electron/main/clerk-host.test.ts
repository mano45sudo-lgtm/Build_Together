import { describe, expect, it } from 'vitest';
import {
  clerkCspSources,
  deriveClerkFrontendApiHost,
  resolveClerkFrontendApiHost,
  validateClerkFrontendApiHost,
} from './clerk-host';

describe('Clerk Frontend API host configuration', () => {
  it('accepts a hostname only and rejects wildcard or URL input', () => {
    expect(validateClerkFrontendApiHost('clerk.example.com', false)).toBe('clerk.example.com');
    expect(() => validateClerkFrontendApiHost('https://clerk.example.com', false)).toThrow();
    expect(() => validateClerkFrontendApiHost('*.clerk.example.com', false)).toThrow();
    expect(() => validateClerkFrontendApiHost('clerk.example.com/path', false)).toThrow();
  });

  it('derives the exact dev host from the Clerk publishable key format', () => {
    const encoded = Buffer.from('sample.clerk.accounts.dev$').toString('base64');
    expect(deriveClerkFrontendApiHost(`pk_test_${encoded}`)).toBe('sample.clerk.accounts.dev');
  });

  it('requires the supplied production host and never derives production configuration implicitly', () => {
    expect(() => resolveClerkFrontendApiHost({ development: false })).toThrow(
      /Set VITE_CLERK_FRONTEND_API_HOST/,
    );
    expect(() =>
      resolveClerkFrontendApiHost({
        development: false,
        host: 'localhost:4444',
        publishableKey: 'pk_live_ignored',
      }),
    ).toThrow(/cannot be localhost/);
  });

  it('builds exact Frontend API sources without Clerk-wide wildcard hosts', () => {
    expect(clerkCspSources('clerk.cue.example')).toEqual({
      frontendApi: 'https://clerk.cue.example',
      frontendSocket: 'wss://clerk.cue.example',
      images: 'https://img.clerk.com',
    });
  });
});
