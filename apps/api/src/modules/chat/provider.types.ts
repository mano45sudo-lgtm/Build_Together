/**
 * Framework-agnostic chat provider contract (ADR-0004). The whole Nexconn Server SDK is hidden
 * behind this interface so:
 *  - unit tests inject a fake and prove our logic (token minting, identity mapping, membership,
 *    workspace isolation) without live provider credentials;
 *  - a future provider swap (or self-hosting) touches exactly one adapter, not the services.
 *
 * No Express types and no Prisma here. Ids are opaque provider strings — never BuildTogether ids.
 */

/** A freshly minted, short-lived, user-scoped client token. */
export interface IssuedToken {
  /** The provider access token the client SDK connects with. */
  accessToken: string;
  /** The provider-side user id this token belongs to (our deterministic external id). */
  externalId: string;
}

/** Coarse failure categories a provider call can surface; mapped to HTTP by the service layer. */
export type ProviderFailure =
  | 'unconfigured' // provider credentials/domains missing → fail closed (503)
  | 'bad_request' // 400 from provider
  | 'unauthorized' // 401 — App Key/Secret wrong (500-class for us, never shown raw)
  | 'forbidden' // 403
  | 'not_found' // 404
  | 'conflict' // 409 — e.g. channel already exists
  | 'rate_limited' // 429
  | 'unavailable' // 5xx / network
  | 'unknown';

/** Error thrown by a provider adapter. Carries a safe message (no secrets) + a mappable kind. */
export class ProviderError extends Error {
  constructor(
    readonly failure: ProviderFailure,
    message: string,
    readonly causeCode?: number | undefined,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

/**
 * The capabilities BuildTogether needs from a chat provider. Deliberately narrow: the provider owns
 * transport/messages/presence; we only register identities, mint tokens, and manage group membership.
 */
export interface ChatProvider {
  /** Whether the underlying provider has usable credentials in this environment. */
  isConfigured(): boolean;

  /**
   * Register/refresh a provider identity for `externalId` and return a client token. Nexconn's
   * "issue access token" both creates the user (first time) and returns a token, so this is idempotent.
   */
  issueToken(input: {
    externalId: string;
    name: string;
    avatarUrl?: string | null;
  }): Promise<IssuedToken>;

  /** Force a set of provider identities' tokens to expire immediately (membership revoked / logout). */
  expireTokens(externalIds: string[]): Promise<void>;

  /** Create a group channel owned by `ownerExternalId`. Idempotent-friendly: conflict is surfaced. */
  createGroup(input: { channelId: string; name: string; ownerExternalId: string }): Promise<void>;

  /** Add members to a group channel. */
  joinGroup(input: { channelId: string; memberExternalIds: string[] }): Promise<void>;

  /** Remove members from a group channel (also used when an admin removes a member). */
  leaveGroup(input: { channelId: string; memberExternalIds: string[] }): Promise<void>;

  /** Dismiss (delete) a group channel. */
  dismissGroup(input: { channelId: string }): Promise<void>;
}
