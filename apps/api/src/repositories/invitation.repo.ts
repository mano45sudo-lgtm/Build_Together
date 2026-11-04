import type { WorkspaceRole } from '@buildtogether/shared';
import { hashToken } from '../lib/crypto.js';
import { prisma } from '../lib/prisma.js';
import type { InvitationRow } from '../lib/view.js';

/**
 * Workspace invitation persistence. Only the SHA-256 hash of the token is stored; the raw token
 * is minted by the invitation service and surfaced once (dev delivery) — never persisted, never
 * logged. Lookups are by hash so a leaked row can't be replayed, and status/expiry make tokens
 * single-use.
 */

export interface CreatedInvitationRow {
  invitation: InvitationRow;
  rawToken: string;
}

const invitationSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
  acceptedAt: true,
  createdAt: true,
  invitedBy: { select: { name: true } },
} as const;

/**
 * Mint an invitation: generate a token, store its hash + metadata in one query, and hand the raw
 * token back to the service so it can build the (dev-only) invite link. `expiresAt` and `tokenHash`
 * come from the caller — the service owns token generation so crypto stays in one place.
 */
export async function create(params: {
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  tokenHash: string;
  invitedById: string;
  expiresAt: Date;
}): Promise<InvitationRow> {
  const row = await prisma.workspaceInvitation.create({
    data: {
      workspaceId: params.workspaceId,
      email: params.email,
      role: params.role,
      tokenHash: params.tokenHash,
      invitedById: params.invitedById,
      expiresAt: params.expiresAt,
    },
    select: invitationSelect,
  });
  return row as unknown as InvitationRow;
}

/** Resolve an invitation by its raw token (hash lookup). Used at accept-time. */
export async function findByToken(
  token: string,
): Promise<(InvitationRow & { workspaceId: string; tokenHash: string }) | null> {
  const row = await prisma.workspaceInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { ...invitationSelect, workspaceId: true, tokenHash: true },
  });
  return row as unknown as (InvitationRow & { workspaceId: string; tokenHash: string }) | null;
}

export async function findById(id: string): Promise<InvitationRow | null> {
  const row = await prisma.workspaceInvitation.findUnique({
    where: { id },
    select: invitationSelect,
  });
  return row ? (row as unknown as InvitationRow) : null;
}

/** Find an invitation only if it belongs to the given workspace (prevents cross-workspace access). */
export async function findByIdInWorkspace(
  workspaceId: string,
  id: string,
): Promise<InvitationRow | null> {
  const row = await prisma.workspaceInvitation.findFirst({
    where: { id, workspaceId },
    select: invitationSelect,
  });
  return row ? (row as unknown as InvitationRow) : null;
}

/** All invitations for a workspace (any status) — for the team-management list. */
export async function listForWorkspace(workspaceId: string): Promise<InvitationRow[]> {
  const rows = await prisma.workspaceInvitation.findMany({
    where: { workspaceId },
    select: invitationSelect,
    orderBy: { createdAt: 'desc' },
  });
  return rows as unknown as InvitationRow[];
}

/** Pending, unexpired invitations addressed to an email — shown on the invitee's inbox. */
export async function listPendingForEmail(email: string): Promise<InvitationRow[]> {
  const rows = await prisma.workspaceInvitation.findMany({
    where: { email, status: 'PENDING', expiresAt: { gt: new Date() } },
    select: invitationSelect,
    orderBy: { createdAt: 'desc' },
  });
  return rows as unknown as InvitationRow[];
}

/** Is there already a PENDING (unexpired) invitation for this email in this workspace? */
export async function hasPendingFor(workspaceId: string, email: string): Promise<boolean> {
  const count = await prisma.workspaceInvitation.count({
    where: { workspaceId, email, status: 'PENDING', expiresAt: { gt: new Date() } },
  });
  return count > 0;
}

export async function markAccepted(id: string): Promise<void> {
  await prisma.workspaceInvitation.update({
    where: { id },
    data: { status: 'ACCEPTED', acceptedAt: new Date() },
  });
}

export async function markRevoked(id: string): Promise<void> {
  await prisma.workspaceInvitation.update({
    where: { id },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });
}
