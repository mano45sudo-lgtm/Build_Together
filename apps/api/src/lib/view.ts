import type {
  AuthSessionView,
  InvitationStatus,
  InvitationSummary,
  MemberSummary,
  PublicUser,
  WorkspaceRole,
  WorkspaceSummary,
} from '@buildtogether/shared';

/**
 * Presentation mappers (repository row → shared DTO). Kept separate from repositories so the
 * Prisma→wire translation is the single place dates are serialized and the password hash and raw
 * tokens are guaranteed to be dropped. Only ever receives already-scoped, already-authorized rows.
 */

/** The wire-safe subset of a Prisma `User` (never carries the password hash). */
export interface UserRecord {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: Date;
}

/** A membership row joined with its workspace summary + member count. */
export interface MembershipWithWorkspace {
  role: WorkspaceRole;
  createdAt: Date;
  workspace: {
    id: string;
    name: string;
    description: string | null;
    iconUrl: string | null;
    createdAt: Date;
    _count: { memberships: number };
  };
}

/** A membership row joined with the member's user record. */
export interface MemberRow {
  role: WorkspaceRole;
  createdAt: Date;
  user: UserRecord;
}

/** An invitation row joined with its inviter name. */
export interface InvitationRow {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  invitedBy: { name: string };
}

const iso = (d: Date): string => d.toISOString();

export function toPublicUser(u: UserRecord): PublicUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarUrl,
    status: u.status,
    createdAt: iso(u.createdAt),
  };
}

export function toWorkspaceSummary(m: MembershipWithWorkspace): WorkspaceSummary {
  return {
    id: m.workspace.id,
    name: m.workspace.name,
    description: m.workspace.description,
    iconUrl: m.workspace.iconUrl,
    role: m.role,
    memberCount: m.workspace._count.memberships,
    createdAt: iso(m.workspace.createdAt),
  };
}

export function toMemberSummary(row: MemberRow): MemberSummary {
  return {
    userId: row.user.id,
    name: row.user.name,
    email: row.user.email,
    avatarUrl: row.user.avatarUrl,
    role: row.role,
    joinedAt: iso(row.createdAt),
  };
}

export function toInvitationSummary(inv: InvitationRow): InvitationSummary {
  return {
    id: inv.id,
    email: inv.email,
    role: inv.role,
    status: inv.status,
    invitedBy: inv.invitedBy.name,
    createdAt: iso(inv.createdAt),
    expiresAt: iso(inv.expiresAt),
    acceptedAt: inv.acceptedAt ? iso(inv.acceptedAt) : null,
  };
}

export function buildSessionView(
  user: UserRecord,
  memberships: MembershipWithWorkspace[],
): AuthSessionView {
  return {
    user: toPublicUser(user),
    workspaces: memberships.map(toWorkspaceSummary),
  };
}
