import type { WorkspaceRole } from '@buildtogether/shared';
import { prisma } from '../lib/prisma.js';
import type { MemberRow } from '../lib/view.js';

/**
 * Workspace membership persistence: listing members, changing roles, and removal. Role-change
 * authorization rules (owner immutability, no self-escalation, must keep an owner) are enforced
 * in the membership SERVICE — this layer only performs the storage operations the service asks for,
 * each wrapped in a transaction where atomicity matters.
 */

const memberSelect = {
  role: true,
  createdAt: true,
  user: {
    select: { id: true, name: true, email: true, avatarUrl: true, status: true, createdAt: true },
  },
} as const;

export async function listMembers(workspaceId: string): Promise<MemberRow[]> {
  const rows = await prisma.workspaceMembership.findMany({
    where: { workspaceId },
    select: memberSelect,
    orderBy: { createdAt: 'asc' },
  });
  return rows as unknown as MemberRow[];
}

export async function getMemberRole(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  const m = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return m ? (m.role as WorkspaceRole) : null;
}

/** Number of OWNER memberships in the workspace (guards the "must always have an owner" rule). */
export async function countOwners(workspaceId: string): Promise<number> {
  return prisma.workspaceMembership.count({ where: { workspaceId, role: 'OWNER' } });
}

export async function setRole(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
): Promise<void> {
  await prisma.workspaceMembership.update({
    where: { workspaceId_userId: { workspaceId, userId } },
    data: { role },
  });
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  await prisma.workspaceMembership.delete({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
}

/**
 * Atomically transfer ownership: demote the current owner to ADMIN and promote the target to OWNER.
 * Used by the (owner-only) transfer operation so a workspace is never left owner-less.
 */
export async function transferOwnership(
  workspaceId: string,
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.workspaceMembership.update({
      where: { workspaceId_userId: { workspaceId, userId: toUserId } },
      data: { role: 'OWNER' },
    }),
    prisma.workspaceMembership.update({
      where: { workspaceId_userId: { workspaceId, userId: fromUserId } },
      data: { role: 'ADMIN' },
    }),
  ]);
}

/** Add a member (used when an invitation is accepted). Idempotent via upsert on the unique key. */
export async function addMember(
  workspaceId: string,
  userId: string,
  role: WorkspaceRole,
): Promise<void> {
  await prisma.workspaceMembership.upsert({
    where: { workspaceId_userId: { workspaceId, userId } },
    create: { workspaceId, userId, role },
    update: {},
  });
}
