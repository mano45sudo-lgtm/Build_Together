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

  describe('development key separation', () => {
    const base = {
      clerkIssuer: 'issuer-placeholder',
      clerkAuthorizedParties: ['app://bundle'],
    };
    const devKey = 'sk_test_' + 'x'.repeat(20);

    it('rejects a development-instance secret key in production without echoing it', () => {
      let message = '';
      try {
        validateClerkProductionConfiguration({
          nodeEnv: 'production',
          clerkSecretKey: devKey,
          ...base,
        });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/development key \(sk_test_\)/);
      expect(message).not.toContain(devKey);
    });

    it('accepts a production-instance key in production', () => {
      expect(() =>
        validateClerkProductionConfiguration({
          nodeEnv: 'production',
          clerkSecretKey: 'sk_live_' + 'y'.repeat(20),
          ...base,
        }),
      ).not.toThrow();
    });

    it('keeps development keys usable outside production', () => {
      for (const nodeEnv of ['development', 'test']) {
        expect(() =>
          validateClerkProductionConfiguration({ nodeEnv, clerkSecretKey: devKey, ...base }),
        ).not.toThrow();
      }
    });
  });
});
