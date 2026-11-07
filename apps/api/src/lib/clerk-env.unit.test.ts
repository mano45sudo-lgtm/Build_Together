import { describe, expect, it } from 'vitest';
import { validateClerkProductionConfiguration } from './clerk-env.js';

describe('production Clerk configuration', () => {
  it('requires the provisioning secret, issuer and at least one authorized party', () => {
    expect(() => validateClerkProductionConfiguration({ nodeEnv: 'production' })).toThrow(
      /CLERK_SECRET_KEY, CLERK_JWT_ISSUER, CLERK_AUTHORIZED_PARTIES/,
    );
  });

  it('accepts configured values without printing them', () => {
    expect(() =>
      validateClerkProductionConfiguration({
        nodeEnv: 'production',
        clerkSecretKey: 'secret-placeholder',
        clerkIssuer: 'issuer-placeholder',
        clerkAuthorizedParties: ['app://bundle'],
      }),
    ).not.toThrow();
  });

  it('fails configuration when the first-login provisioning secret is missing', () => {
    expect(() =>
      validateClerkProductionConfiguration({
        nodeEnv: 'production',
        clerkIssuer: 'issuer-placeholder',
        clerkAuthorizedParties: ['app://bundle'],
      }),
    ).toThrow(/CLERK_SECRET_KEY/);
  });

  it('keeps development usable without production Clerk settings', () => {
    expect(() => validateClerkProductionConfiguration({ nodeEnv: 'development' })).not.toThrow();
  });
});
