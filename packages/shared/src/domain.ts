/**
 * Phase 2 domain contracts (identity, workspaces, membership, invitations).
 *
 * Single source of truth compiled by BOTH `@buildtogether/api` (response/request shapes)
 * and the `@buildtogether/desktop` renderer + main IPC surface. Keeping them here means the
 * API envelope, the desktop bridge, and the UI can never drift. No runtime code — types +
 * a couple of const tables only (frontend-engineering / backend-engineering rules).
 */

import type { ApiResponse } from './index.js';

// ---- Enums (mirror the Prisma enums; string unions for the wire) ----

export type AccountStatus = 'ACTIVE' | 'DISABLED';

/** Phase 2 workspace roles — three levels, exact permissions enforced server-side. */
export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

/** Canonical role ordering used for hierarchy checks (higher number ⊇ lower). */
export const ROLE_RANK: Record<WorkspaceRole, number> = {
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

// ---- Read models (what the client is allowed to see) ----

/** A user's own view / a member row. Never includes the password hash. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: AccountStatus;
  createdAt: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  /** The requesting user's role in this workspace. */
  role: WorkspaceRole;
  memberCount: number;
  createdAt: string;
}

export interface MemberSummary {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: WorkspaceRole;
  /** ISO timestamp the membership was created. */
  joinedAt: string;
}

export interface InvitationSummary {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: InvitationStatus;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
}

/** Session state handed to the renderer. Contains NO tokens — identity only. */
export interface AuthSessionView {
  user: PublicUser;
  /** Workspaces the user belongs to (empty right after registration → onboarding). */
  workspaces: WorkspaceSummary[];
}

// ---- Write inputs (validated server-side; mirrored here for typed clients) ----

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateProfileInput {
  name?: string;
  avatarUrl?: string | null;
}

export interface CreateWorkspaceInput {
  name: string;
  description?: string;
  iconUrl?: string | null;
}

export interface UpdateWorkspaceInput {
  name?: string;
  description?: string | null;
  iconUrl?: string | null;
}

export interface CreateInvitationInput {
  email: string;
  role: WorkspaceRole;
}

export interface AcceptInvitationInput {
  token: string;
}

/** Result of creating an invitation. `delivery` is dev-only surfaced plaintext (see ADR). */
export interface CreatedInvitation {
  invitation: InvitationSummary;
  /**
   * Present only when no real email transport is configured. In development it is the accept link;
   * in production (no link exists) it is the bare invite code. The desktop join field accepts both.
   */
  devInviteLink?: string;
}

/**
 * Session tokens returned by the API **to the trusted desktop main process only**
 * (ADR-0003). The renderer never receives this shape — main stores the tokens (encrypted
 * via safeStorage) and hands the renderer just the `session` view. Raw tokens are returned
 * once and are stored server-side only as hashes.
 */
export interface IssuedSession {
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessExpiresAt: string;
    refreshExpiresAt: string;
  };
  session: AuthSessionView;
}

// ---- API endpoint aliases (self-documenting response types) ----

/** register / login / refresh carry the token pair to main (never past it). */
export type AuthTokensResponse = ApiResponse<IssuedSession>;
/** me returns the session view only — main already holds the tokens. */
export type MeResponse = ApiResponse<AuthSessionView>;
export type UsersMeResponse = ApiResponse<PublicUser>;
export type WorkspaceListResponse = ApiResponse<WorkspaceSummary[]>;
export type WorkspaceResponse = ApiResponse<WorkspaceSummary>;
export type MemberListResponse = ApiResponse<MemberSummary[]>;
export type InvitationListResponse = ApiResponse<InvitationSummary[]>;
export type InvitationResponse = ApiResponse<InvitationSummary>;
export type CreatedInvitationResponse = ApiResponse<CreatedInvitation>;
