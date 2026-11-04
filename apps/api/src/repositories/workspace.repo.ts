import type { WorkspaceRole } from '@buildtogether/shared';
import { prisma } from '../lib/prisma.js';
import type { MembershipWithWorkspace } from '../lib/view.js';

/**
 * Workspace + membership persistence. Creating a workspace and adding its owner as an OWNER
 * membership happens in ONE transaction, so a workspace can never exist without an owner.
 * Role lookups back every server-side authorization check (never trusting the client).
 */

export interface WorkspaceUpdate {
  name?: string;
  description?: string | null;
  iconUrl?: string | null;
}

const membershipViewInclude = {
  workspace: {
    select: {
      id: true,
      name: true,
      description: true,
      iconUrl: true,
      createdAt: true,
      _count: { select: { memberships: true } },
    },
  },
} as const;

/** Create a workspace and its creator OWNER membership atomically. */
export async function createWithOwner(
  ownerId: string,
  data: { name: string; description?: string; iconUrl?: string | null },
): Promise<MembershipWithWorkspace> {
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        iconUrl: data.iconUrl ?? null,
        createdById: ownerId,
        memberships: { create: { userId: ownerId, role: 'OWNER' } },
      },
    });
    const view = await tx.workspaceMembership.findUniqueOrThrow({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: ownerId } },
      include: membershipViewInclude,
    });
    return view as unknown as MembershipWithWorkspace;
  });
}

/** All workspaces the user belongs to, as membership+workspace rows (ordered by creation). */
export async function listMembershipsForUser(userId: string): Promise<MembershipWithWorkspace[]> {
  const rows = await prisma.workspaceMembership.findMany({
    where: { userId },
    include: membershipViewInclude,
    orderBy: { createdAt: 'asc' },
  });
  return rows as unknown as MembershipWithWorkspace[];
}

export async function findMembershipView(
  workspaceId: string,
  userId: string,
): Promise<MembershipWithWorkspace | null> {
  const row = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: membershipViewInclude,
  });
  return row ? (row as unknown as MembershipWithWorkspace) : null;
}

export async function getRole(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
  const m = await prisma.workspaceMembership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  return m ? (m.role as WorkspaceRole) : null;
}

export async function updateWorkspace(workspaceId: string, data: WorkspaceUpdate): Promise<void> {
  await prisma.workspace.update({ where: { id: workspaceId }, data });
}

/** Does the workspace exist at all? Used to distinguish 404 from 403 in `get`. */
export async function workspaceExists(workspaceId: string): Promise<boolean> {
  const count = await prisma.workspace.count({ where: { id: workspaceId } });
  return count > 0;
}
