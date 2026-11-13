export interface ClerkProductionConfiguration {
  nodeEnv: string;
  clerkSecretKey?: string | undefined;
  clerkIssuer?: string | undefined;
  clerkAuthorizedParties?: string[] | undefined;
}

/** Validate required production verification/provisioning configuration without exposing values. */
export function validateClerkProductionConfiguration(config: ClerkProductionConfiguration): void {
  if (config.nodeEnv !== 'production') return;

  const missing: string[] = [];
  if (!config.clerkSecretKey) missing.push('CLERK_SECRET_KEY');
  if (!config.clerkIssuer) missing.push('CLERK_JWT_ISSUER');
  if (!config.clerkAuthorizedParties?.length) missing.push('CLERK_AUTHORIZED_PARTIES');
  if (missing.length) {
    throw new Error(`Missing required production Clerk configuration: ${missing.join(', ')}`);
  }
  // Clerk issues `sk_test_` keys for Development instances and `sk_live_` for Production instances.
  // A development instance must never back production; only the documented prefix is checked —
  // the key itself is never parsed, logged or echoed.
  if (config.clerkSecretKey?.startsWith('sk_test_')) {
    throw new Error(
      'CLERK_SECRET_KEY is a Clerk development key (sk_test_); production requires a production-instance key',
    );
  }
}
