import type { MemberSummary, WorkspaceRole } from '@buildtogether/shared';
import { badRequest, forbidden, notFound } from '../errors/app-error.js';
import * as membershipRepo from '../repositories/membership.repo.js';
import * as workspaceRepo from '../repositories/workspace.repo.js';
import { toMemberSummary } from '../lib/view.js';

/**
 * Membership + role management. The route middleware has ALREADY verified (server-side, fresh
 * from the DB) that the actor is at least an ADMIN of the workspace and is a member. This service
 * layers the finer ownership rules on top. Security never relies on the desktop hiding controls:
 * every mutation re-derives roles from the database and rejects the disallowed transitions.
 *
 * Rules (brief §7):
 *  - OWNER is never assignable via role-change; only an owner can TRANSFER ownership.
 *  - An owner cannot be demoted or removed (they must transfer first).
 *  - The owner cannot leave/remove themselves while owner.
 *  - ADMINs manage MEMBERs only — never the owner, never other ADMINs, never themselves upward.
 *  - A workspace must always retain exactly one owner.
 */

export async function listMembers(workspaceId: string): Promise<MemberSummary[]> {
  const rows = await membershipRepo.listMembers(workspaceId);
  return rows.map(toMemberSummary);
}

export async function updateMemberRole(
  workspaceId: string,
  actorUserId: string,
  targetUserId: string,
  newRole: WorkspaceRole,
): Promise<void> {
  const actorRole = await requireRole(workspaceId, actorUserId);
  const targetRole = await requireRole(workspaceId, targetUserId);

  // OWNER is established only by transfer — never by a direct role write (privilege-escalation guard).
  if (newRole === 'OWNER') {
    throw forbidden('OWNER_NOT_ASSIGNABLE', 'Ownership can only be transferred, not assigned');
  }

  if (targetRole === 'OWNER') {
    throw forbidden('OWNER_IMMUTABLE', "The workspace owner's role cannot be changed here");
  }

  // Admins manage members only; they cannot touch the owner (handled above) or fellow admins.
  if (actorRole === 'ADMIN' && (targetRole === 'ADMIN' || targetUserId === actorUserId)) {
    throw forbidden('INSUFFICIENT_ROLE', 'Only the owner can change another admin’s role');
  }

  await membershipRepo.setRole(workspaceId, targetUserId, newRole);
}

export async function removeMember(
  workspaceId: string,
  actorUserId: string,
  targetUserId: string,
): Promise<void> {
  const actorRole = await requireRole(workspaceId, actorUserId);
  const targetRole = await requireRole(workspaceId, targetUserId);

  // Owners are never removable (ownership must be transferred first) — by anyone, including self.
  if (targetRole === 'OWNER') {
    throw forbidden('OWNER_CANNOT_LEAVE', 'Transfer ownership before removing yourself as owner');
  }

  if (targetUserId !== actorUserId) {
    // Managing someone else's membership requires ADMIN; a plain member may only remove themselves.
    if (actorRole === 'MEMBER') {
      throw forbidden('INSUFFICIENT_ROLE', 'Only an admin can remove another member');
    }
    // Admins may remove MEMBERs only — never an owner (handled above) or a fellow admin.
    if (actorRole === 'ADMIN' && targetRole !== 'MEMBER') {
      throw forbidden('INSUFFICIENT_ROLE', 'Only the owner can remove an admin');
    }
  }

  await membershipRepo.removeMember(workspaceId, targetUserId);
}

/**
 * Owner-only ownership transfer. Runs as ONE transaction (demote self → promote target), so the
 * workspace is never left owner-less. The target must already be a member.
 */
export async function transferOwnership(
  workspaceId: string,
  actorUserId: string,
  targetUserId: string,
): Promise<void> {
  const actorRole = await requireRole(workspaceId, actorUserId);
  if (actorRole !== 'OWNER') {
    throw forbidden('OWNER_ONLY', 'Only the owner can transfer ownership');
  }
  const targetRole = await workspaceRepo.getRole(workspaceId, targetUserId);
  if (!targetRole)
    throw notFound('MEMBER_NOT_FOUND', 'That user is not a member of this workspace');
  if (targetUserId === actorUserId) {
    throw badRequest('INVALID_TRANSFER', 'Choose a different member to transfer ownership to');
  }

  await membershipRepo.transferOwnership(workspaceId, actorUserId, targetUserId);
}

// ---- helpers ----

async function requireRole(workspaceId: string, userId: string): Promise<WorkspaceRole> {
  const role = await workspaceRepo.getRole(workspaceId, userId);
  if (!role) throw forbidden('NOT_A_MEMBER', 'You do not have access to this workspace');
  return role;
}
