import type {
  AcceptInvitationInput,
  ChangePasswordInput,
  CreateConversationInput,
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
  // Chat APP-LEVEL operations (workspace-scoped metadata + the ephemeral Nexconn client token). The
  // realtime message transport is NOT here — see `chat-client.ts`, which drives Web IMLib directly.
  chat: {
    getToken: (workspaceId: string) => unwrap(requireBridge().chat.getToken(workspaceId)),
    listConversations: (workspaceId: string) =>
      unwrap(requireBridge().chat.listConversations(workspaceId)),
    createConversation: (workspaceId: string, input: CreateConversationInput) =>
      unwrap(requireBridge().chat.createConversation(workspaceId, input)),
    getConversation: (workspaceId: string, conversationId: string) =>
      unwrap(requireBridge().chat.getConversation(workspaceId, conversationId)),
    addMembers: (workspaceId: string, conversationId: string, userIds: string[]) =>
      unwrap(requireBridge().chat.addMembers(workspaceId, conversationId, userIds)),
    removeMember: (workspaceId: string, conversationId: string, userId: string) =>
      unwrap(requireBridge().chat.removeMember(workspaceId, conversationId, userId)),
  },
};
