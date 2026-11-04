import type {
  CreatedInvitation,
  InvitationSummary,
  WorkspaceRole,
  WorkspaceSummary,
} from '@buildtogether/shared';
import { badRequest, conflict, forbidden, notFound } from '../errors/app-error.js';
import { generateToken, hashToken } from '../lib/crypto.js';
import { env } from '../lib/env.js';
import { toInvitationSummary, toWorkspaceSummary } from '../lib/view.js';
import * as invitationRepo from '../repositories/invitation.repo.js';
import * as membershipRepo from '../repositories/membership.repo.js';
import * as userRepo from '../repositories/user.repo.js';
import * as workspaceRepo from '../repositories/workspace.repo.js';
import { buildAcceptUrl, getEmailProvider } from './email.provider.js';
import { normalizeEmail } from '../validation/schemas.js';

/**
 * Invitation lifecycle: create → (email or dev link) → accept. Tokens are high-entropy random
 * strings; only their SHA-256 hash is stored, expiry is enforced, and status makes each token
 * single-use. Acceptance re-checks everything server-side and can NEVER escalate the acceptor
 * beyond ADMIN/MEMBER (the create schema already forbade inviting an OWNER). Email existence is
 * never faked: when the transport doesn't deliver, the link is returned for dev display only.
 */

export async function createInvitation(
  workspaceId: string,
  inviterId: string,
  input: { email: string; role: WorkspaceRole },
): Promise<CreatedInvitation> {
  const workspace = await workspaceRepo.findMembershipView(workspaceId, inviterId);
  if (!workspace) throw notFound('WORKSPACE_NOT_FOUND', 'Workspace not found');

  const email = normalizeEmail(input.email);

  // Already a member? Nothing to invite. Look the person up by their normalized email.
  const invitee = await userRepo.findByEmailWithSecret(email);
  if (invitee && (await membershipRepo.getMemberRole(workspaceId, invitee.id))) {
    throw conflict('ALREADY_MEMBER', 'That person is already a member of this workspace');
  }
  // A live invitation already outstanding?
  if (await invitationRepo.hasPendingFor(workspaceId, email)) {
    throw conflict('INVITE_PENDING', 'An invitation for that email is already pending');
  }

  const inviter = await userRepo.findUserById(inviterId);
  if (!inviter) throw notFound('USER_NOT_FOUND', 'Inviter not found');

  const rawToken = generateToken(32);
  const expiresAt = new Date(Date.now() + env.invitationTtlSeconds * 1000);

  const row = await invitationRepo.create({
    workspaceId,
    email,
    role: input.role,
    tokenHash: hashToken(rawToken),
    invitedById: inviterId,
    expiresAt,
  });

  const acceptUrl = buildAcceptUrl(rawToken);
  const provider = getEmailProvider();
  await provider.sendInvitation({
    workspaceName: workspace.workspace.name,
    inviteeEmail: email,
    inviterName: inviter.name,
    role: input.role,
    acceptUrl,
  });

  return {
    invitation: toInvitationSummary(row),
    // Only surface the plaintext link when mail is not actually delivered (development).
    ...(provider.delivers ? {} : { devInviteLink: acceptUrl }),
  };
}

export async function listInvitations(workspaceId: string): Promise<InvitationSummary[]> {
  const rows = await invitationRepo.listForWorkspace(workspaceId);
  return rows.map(toInvitationSummary);
}

/** Pending invitations addressed to the caller's email (their personal invite inbox). */
export async function pendingForUser(userId: string): Promise<InvitationSummary[]> {
  const user = await userRepo.findUserById(userId);
  if (!user) throw notFound('USER_NOT_FOUND', 'User not found');
  const rows = await invitationRepo.listPendingForEmail(user.email);
  return rows.map(toInvitationSummary);
}

export async function revokeInvitation(workspaceId: string, invitationId: string): Promise<void> {
  // Scope the lookup to the workspace so an invitation id from another workspace is a 404 here
  // (cross-workspace access denied). The route has already required ADMIN for this workspace.
  const inv = await invitationRepo.findByIdInWorkspace(workspaceId, invitationId);
  if (!inv) throw notFound('INVITATION_NOT_FOUND', 'Invitation not found');
  if (inv.status !== 'PENDING') {
    throw badRequest('INVITATION_NOT_PENDING', 'Only a pending invitation can be revoked');
  }
  await invitationRepo.markRevoked(invitationId);
}

/**
 * Accept an invitation with a raw token, as the authenticated user whose email must match. Marks
 * the invitation accepted and adds the membership in ONE repository-driven sequence. Guards: token
 * must exist, be PENDING, be unexpired, and belong to this email — otherwise reject without
 * mutating anything. Duplicate membership is impossible (the unique key + the check below).
 */
export async function acceptInvitation(token: string, userId: string): Promise<WorkspaceSummary> {
  const inv = await invitationRepo.findByToken(token);
  if (!inv) throw notFound('INVITATION_NOT_FOUND', 'Invitation not found');
  if (inv.status === 'ACCEPTED')
    throw badRequest('INVITATION_ACCEPTED', 'This invitation was already used');
  if (inv.status === 'REVOKED')
    throw forbidden('INVITATION_REVOKED', 'This invitation was revoked');
  if (inv.status === 'EXPIRED' || inv.expiresAt.getTime() <= Date.now()) {
    throw forbidden('INVITATION_EXPIRED', 'This invitation has expired');
  }

  const user = await userRepo.findUserById(userId);
  if (!user) throw notFound('USER_NOT_FOUND', 'User not found');
  // The acceptor's own email must match the invited address (no token interception by a third party).
  if (user.email !== normalizeEmail(inv.email)) {
    throw forbidden('EMAIL_MISMATCH', 'This invitation was issued to a different email');
  }

  // Already a member (e.g. added directly after the invite)? Reap the invite, no duplicate row.
  if (await membershipRepo.getMemberRole(inv.workspaceId, userId)) {
    await invitationRepo.markAccepted(inv.id);
    const view = await workspaceRepo.findMembershipView(inv.workspaceId, userId);
    if (!view) throw notFound('WORKSPACE_NOT_FOUND', 'Workspace not found');
    return toWorkspaceSummary(view);
  }

  await membershipRepo.addMember(inv.workspaceId, userId, inv.role);
  await invitationRepo.markAccepted(inv.id);

  const view = await workspaceRepo.findMembershipView(inv.workspaceId, userId);
  if (!view) throw notFound('WORKSPACE_NOT_FOUND', 'Workspace not found');
  return toWorkspaceSummary(view);
}
