export interface ClerkHostConfig {
  host?: string | undefined;
  publishableKey?: string | undefined;
  development: boolean;
}

/** Validate a host-only Clerk Frontend API value (without scheme, path, credentials or wildcards). */
export function validateClerkFrontendApiHost(raw: string, development: boolean): string {
  const value = raw.trim();
  if (!value || /[\s/*?#@]/.test(value) || value.includes('://')) {
    throw new Error(
      'VITE_CLERK_FRONTEND_API_HOST must be a hostname without scheme, path, or wildcard',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(`https://${value}`);
  } catch {
    throw new Error('VITE_CLERK_FRONTEND_API_HOST is not a valid hostname');
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    parsed.host.toLowerCase() !== value.toLowerCase()
  ) {
    throw new Error('VITE_CLERK_FRONTEND_API_HOST must contain only a hostname and optional port');
  }
  if (!development && (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost'))) {
    throw new Error('Production Clerk Frontend API host cannot be localhost');
  }
  return parsed.host.toLowerCase();
}

/** Clerk publishable keys encode the Frontend API hostname; used only as a dev fallback. */
export function deriveClerkFrontendApiHost(publishableKey: string): string | undefined {
  const match = /^pk_(?:test|live)_([A-Za-z0-9_=-]+)$/.exec(publishableKey.trim());
  if (!match) return undefined;
  try {
    const decoded = Buffer.from(match[1]!, 'base64').toString('utf8');
    if (!decoded.endsWith('$')) return undefined;
    return validateClerkFrontendApiHost(decoded.slice(0, -1), true);
  } catch {
    return undefined;
  }
}

/**
 * Publishable-key policy for a desktop build. Clerk issues `pk_test_` keys for Development instances
 * and `pk_live_` for Production instances, so a production build must carry a key that is present
 * and not `pk_test_`. Only the documented prefix is checked; the key is never echoed. Development
 * builds keep accepting test keys, or no key (the app then shows its not-configured state).
 */
export function validateClerkPublishableKeyForBuild(
  publishableKey: string | undefined,
  development: boolean,
): void {
  if (development) return;
  const key = publishableKey?.trim();
  if (!key) {
    throw new Error('VITE_CLERK_PUBLISHABLE_KEY is required for a production desktop build');
  }
  if (key.startsWith('pk_test_')) {
    throw new Error(
      'VITE_CLERK_PUBLISHABLE_KEY is a Clerk development key (pk_test_); production builds require a production-instance key',
    );
  }
}

export function resolveClerkFrontendApiHost(config: ClerkHostConfig): string | undefined {
  if (config.host?.trim()) {
    return validateClerkFrontendApiHost(config.host, config.development);
  }
  if (config.development && config.publishableKey) {
    const derived = deriveClerkFrontendApiHost(config.publishableKey);
    if (derived) return derived;
  }
  if (!config.development) {
    throw new Error(
      'Set VITE_CLERK_FRONTEND_API_HOST to the production Clerk Frontend API hostname',
    );
  }
  // A Clerk-less local shell is still useful for UI work. Authentication will show its existing
  // not-configured state and the renderer CSP will simply omit remote Clerk sources.
  return undefined;
}

export function clerkCspSources(
  host: string,
  development = false,
): {
  frontendApi: string;
  frontendSocket: string;
  images: string;
} {
  const validated = validateClerkFrontendApiHost(host, development);
  return {
    frontendApi: `https://${validated}`,
    frontendSocket: `wss://${validated}`,
    images: 'https://img.clerk.com',
  };
}
