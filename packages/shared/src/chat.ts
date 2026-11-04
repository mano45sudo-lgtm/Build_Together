/**
 * Phase 3 communication contracts (workspace-scoped chat over Nexconn — ADR-0004).
 *
 * Single source of truth compiled by BOTH `@buildtogether/api` and the `@buildtogether/desktop`
 * renderer + main IPC surface. These are the ONLY chat shapes that cross the wire.
 *
 * Security invariant: NOTHING here carries a provider secret. The App Secret and any admin
 * credential never leave the API process. The client-facing `ChatToken` carries a SHORT-LIVED,
 * user-scoped access token plus the PUBLIC App Key the client SDK needs to `init`; that value is
 * minted per request by the trusted backend after it has verified BT identity + workspace
 * membership + conversation authorization. `externalId`/`providerChannelId` are the client's
 * addressing handles on the provider (not secrets — they are what the SDK sends/receives on).
 */

import type { ApiResponse } from './index.js';

// ---- Enums (mirror the Prisma ConversationKind; string unions for the wire) ----

/** GROUP = a Nexconn group channel; DIRECT = a 1:1 peer conversation (no channel id). */
export type ConversationKind = 'GROUP' | 'DIRECT';

// ---- Read models (what an authorized client is allowed to see) ----

/** A conversation participant, with the handles the client needs to address them. */
export interface ConversationParticipantView {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** The participant's Nexconn user id (deterministic `bt-<userId>`); the DM addressing target. */
  externalId: string;
}

/** A workspace-scoped conversation. Message content/history lives in Nexconn, never here. */
export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  /** GROUP conversations carry their Nexconn channelId (the client's conversation `targetId`). */
  providerChannelId: string | null;
  title: string | null;
  workspaceId: string;
  participants: ConversationParticipantView[];
  createdAt: string;
}

/**
 * The client chat credential. Delivered to the trusted desktop MAIN process (which forwards only
 * this to the renderer on demand) — never persisted, short-lived, user-scoped (ADR-0004/§5).
 */
export interface ChatToken {
  /** PUBLIC Nexconn App Key the client SDK uses to `init` (safe to expose to the renderer). */
  appKey: string;
  /** Short-lived, user-scoped access token the client SDK `connect`s with. */
  token: string;
  /** The caller's own Nexconn user id. */
  userId: string;
  /** ISO instant after which `token` no longer authenticates. */
  expiresAt: string;
}

// ---- Write inputs (validated server-side; mirrored here for typed clients) ----

export interface CreateConversationInput {
  kind: ConversationKind;
  /** Required for GROUP; ignored for DIRECT. */
  title?: string;
  /**
   * Other participants (BuildTogether user ids). For DIRECT exactly one peer; for GROUP the initial
   * members (the creator is added implicitly). Every id is re-checked as a workspace member server-side.
   */
  participantUserIds: string[];
}

export interface AddConversationMembersInput {
  /** BuildTogether user ids to add; each must already be a member of the conversation's workspace. */
  userIds: string[];
}

// ---- API endpoint aliases (self-documenting response types) ----

export type ChatTokenResponse = ApiResponse<ChatToken>;
export type ConversationListResponse = ApiResponse<ConversationSummary[]>;
export type ConversationResponse = ApiResponse<ConversationSummary>;
