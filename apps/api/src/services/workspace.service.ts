import type { PublicUser, UpdateProfileInput, WorkspaceSummary } from '@buildtogether/shared';
import { notFound } from '../errors/app-error.js';
import * as userRepo from '../repositories/user.repo.js';
import * as workspaceRepo from '../repositories/workspace.repo.js';
import { toPublicUser, toWorkspaceSummary } from '../lib/view.js';

/**
 * User-profile + workspace CRUD business logic. Authorization (is the caller a member / admin /
 * owner) is enforced by route middleware via a fresh DB check; this service trusts that the caller
 * has already been cleared and focuses on the storage operation + the safe read-model projection.
 */

// ---- profile ----

export async function getProfile(userId: string): Promise<PublicUser> {
  const user = await userRepo.findUserById(userId);
  if (!user) throw notFound('USER_NOT_FOUND', 'User not found');
  return toPublicUser(user);
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<PublicUser> {
  // The validation edge guarantees at least one of name/avatarUrl is present.
  await userRepo.updateUser(userId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
  });
  const user = await userRepo.findUserById(userId);
  if (!user) throw notFound('USER_NOT_FOUND', 'User not found');
  return toPublicUser(user);
}

// ---- workspaces ----

export async function createWorkspace(
  ownerId: string,
  input: { name: string; description?: string; iconUrl?: string | null },
): Promise<WorkspaceSummary> {
  const view = await workspaceRepo.createWithOwner(ownerId, input);
  return toWorkspaceSummary(view);
}

export async function listWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const rows = await workspaceRepo.listMembershipsForUser(userId);
  return rows.map(toWorkspaceSummary);
}

/**
 * Fetch a single workspace the caller is known (by middleware) to belong to. Returns the caller's
 * own summary view; if the membership somehow vanished between gate and read, treat as not-found.
 */
export async function getWorkspace(workspaceId: string, userId: string): Promise<WorkspaceSummary> {
  const view = await workspaceRepo.findMembershipView(workspaceId, userId);
  if (!view) throw notFound('WORKSPACE_NOT_FOUND', 'Workspace not found');
  return toWorkspaceSummary(view);
}

export async function updateWorkspace(
  workspaceId: string,
  userId: string,
  input: { name?: string; description?: string | null; iconUrl?: string | null },
): Promise<WorkspaceSummary> {
  await workspaceRepo.updateWorkspace(workspaceId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.iconUrl !== undefined ? { iconUrl: input.iconUrl } : {}),
  });
  const view = await workspaceRepo.findMembershipView(workspaceId, userId);
  if (!view) throw notFound('WORKSPACE_NOT_FOUND', 'Workspace not found');
  return toWorkspaceSummary(view);
}
