import type {
  AcceptInvitationInput,
  ChangePasswordInput,
  CreateInvitationInput,
  CreateWorkspaceInput,
  UpdateProfileInput,
  UpdateWorkspaceInput,
  WorkspaceRole,
} from '@buildtogether/shared';
import { requireBridge, unwrap } from './bridge';

/**
 * Thin, typed data-access layer for the renderer. Every function crosses the IPC boundary through
 * the preload bridge and unwraps the safe `IpcOutcome` (throwing `BridgeError` on failure). The
 * renderer supplies only ids/inputs — the main process attaches the token and the server authorizes.
 */
export const api = {
  members: {
    list: (workspaceId: string) => unwrap(requireBridge().members.list(workspaceId)),
    updateRole: (workspaceId: string, memberId: string, role: WorkspaceRole) =>
      unwrap(requireBridge().members.updateRole(workspaceId, memberId, role)),
    remove: (workspaceId: string, memberId: string) =>
      unwrap(requireBridge().members.remove(workspaceId, memberId)),
    transfer: (workspaceId: string, memberId: string) =>
      unwrap(requireBridge().members.transfer(workspaceId, memberId)),
  },
  invitations: {
    list: (workspaceId: string) => unwrap(requireBridge().invitations.list(workspaceId)),
    create: (workspaceId: string, input: CreateInvitationInput) =>
      unwrap(requireBridge().invitations.create(workspaceId, input)),
    revoke: (workspaceId: string, invitationId: string) =>
      unwrap(requireBridge().invitations.revoke(workspaceId, invitationId)),
    accept: (input: AcceptInvitationInput) => unwrap(requireBridge().invitations.accept(input)),
    pendingForMe: () => unwrap(requireBridge().invitations.pendingForMe()),
  },
  workspaces: {
    create: (input: CreateWorkspaceInput) => unwrap(requireBridge().workspaces.create(input)),
    update: (workspaceId: string, input: UpdateWorkspaceInput) =>
      unwrap(requireBridge().workspaces.update(workspaceId, input)),
  },
  users: {
    updateMe: (input: UpdateProfileInput) => unwrap(requireBridge().users.updateMe(input)),
  },
  auth: {
    changePassword: (input: ChangePasswordInput) =>
      unwrap(requireBridge().auth.changePassword(input)),
  },
};
