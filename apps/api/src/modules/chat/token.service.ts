import type { ChatToken } from '@buildtogether/shared';
import { notFound, serviceUnavailable } from '../../errors/app-error.js';
import { env } from '../../lib/env.js';
import * as repo from './chat.repo.js';
import { mapProviderError } from './provider-error.js';
import { getChatProvider } from './provider.js';

/**
 * Mint a short-lived, user-scoped Nexconn client token (brief §5). INVARIANTS:
 *  - The caller has ALREADY been authenticated and their workspace membership verified by route
 *    middleware (`authenticate` + `requireWorkspaceRole('MEMBER')`) before this is reached, so a
 *    token is only ever issued to a valid member of the requested workspace.
 *  - The App Secret is never returned and never leaves the process; the response carries only the
 *    PUBLIC App Key (client `init`) + a per-user access token + the caller's own external id.
 *  - Identity is derived solely from the authenticated `userId` (the single source of truth): the
 *    external id is deterministic, so a client can never ask to be minted a token for someone else.
 */
export async function issueChatToken(userId: string): Promise<ChatToken> {
  const appKey = env.nexconnAppKey;
  const provider = getChatProvider();
  // Fail closed with a generic 503 when Nexconn isn't configured — chat is optional infrastructure.
  if (!appKey || !provider.isConfigured()) {
    throw serviceUnavailable('CHAT_UNAVAILABLE', 'Chat is not available');
  }

  // Ensure the BT→Nexconn mapping (DB-only), then read the profile used for provider registration.
  const externalId = await repo.ensureMapping(userId);
  const profile = await repo.getProfileForToken(userId);
  if (!profile) throw notFound('USER_NOT_FOUND', 'Account not found');

  try {
    const issued = await provider.issueToken({
      externalId,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    });
    const expiresAt = new Date(Date.now() + env.nexconnTokenTtlSeconds * 1000).toISOString();
    return {
      appKey,
      token: issued.accessToken,
      userId: issued.externalId,
      expiresAt,
    };
  } catch (error) {
    throw mapProviderError(error);
  }
}
