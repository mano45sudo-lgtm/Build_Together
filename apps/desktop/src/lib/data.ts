import type {
  AcceptInvitationInput,
  AddTaskDependencyInput,
  AssignTaskInput,
  ChangeTaskStatusInput,
  CreateConversationInput,
  CreateDecisionCommentInput,
  CreateDecisionInput,
  CreateInvitationInput,
  CreateProjectInput,
  CreateTaskInput,
  CreateWorkspaceInput,
  DecisionListQuery,
  DecisionParticipantInput,
  ProjectListQuery,
  SupersedeDecisionInput,
  TaskListQuery,
  UpdateDecisionInput,
  UpdateProfileInput,
  UpdateProjectInput,
  UpdateTaskInput,
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
  // Auth is intentionally absent here (ADR-0006): Clerk owns sign up/in and password management, and
  // the short-lived session JWT is synced to the trusted main process by `AuthProvider`, not this layer.
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
  // Projects (Phase 4, workspace-scoped). The renderer only passes ids + a query DTO; the server
  // decides membership / role / ownership and applies search / filter / scope — never the client.
  projects: {
    list: (workspaceId: string, query: ProjectListQuery = {}) =>
      unwrap(requireBridge().projects.list(workspaceId, query)),
    create: (workspaceId: string, input: CreateProjectInput) =>
      unwrap(requireBridge().projects.create(workspaceId, input)),
    getOverview: (workspaceId: string, projectId: string) =>
      unwrap(requireBridge().projects.getOverview(workspaceId, projectId)),
    update: (workspaceId: string, projectId: string, input: UpdateProjectInput) =>
      unwrap(requireBridge().projects.update(workspaceId, projectId, input)),
    archive: (workspaceId: string, projectId: string) =>
      unwrap(requireBridge().projects.archive(workspaceId, projectId)),
    restore: (workspaceId: string, projectId: string) =>
      unwrap(requireBridge().projects.restore(workspaceId, projectId)),
  },
  // Tasks (Phase 5, workspace- + project-scoped). The renderer passes only ids + inputs; the SERVER
  // decides workspace membership, project visibility/ownership, assignee validity and dependency
  // legality. Search / filter / sort / pagination are applied server-side, never in the renderer.
  tasks: {
    list: (workspaceId: string, projectId: string, query: TaskListQuery = {}) =>
      unwrap(requireBridge().tasks.list(workspaceId, projectId, query)),
    create: (workspaceId: string, projectId: string, input: CreateTaskInput) =>
      unwrap(requireBridge().tasks.create(workspaceId, projectId, input)),
    get: (workspaceId: string, taskId: string) =>
      unwrap(requireBridge().tasks.get(workspaceId, taskId)),
    update: (workspaceId: string, taskId: string, input: UpdateTaskInput) =>
      unwrap(requireBridge().tasks.update(workspaceId, taskId, input)),
    remove: (workspaceId: string, taskId: string) =>
      unwrap(requireBridge().tasks.remove(workspaceId, taskId)),
    assign: (workspaceId: string, taskId: string, input: AssignTaskInput) =>
      unwrap(requireBridge().tasks.assign(workspaceId, taskId, input)),
    changeStatus: (workspaceId: string, taskId: string, input: ChangeTaskStatusInput) =>
      unwrap(requireBridge().tasks.changeStatus(workspaceId, taskId, input)),
    dependencies: (workspaceId: string, taskId: string) =>
      unwrap(requireBridge().tasks.dependencies(workspaceId, taskId)),
    addDependency: (workspaceId: string, taskId: string, input: AddTaskDependencyInput) =>
      unwrap(requireBridge().tasks.addDependency(workspaceId, taskId, input)),
    removeDependency: (workspaceId: string, taskId: string, dependencyId: string) =>
      unwrap(requireBridge().tasks.removeDependency(workspaceId, taskId, dependencyId)),
    activity: (
      workspaceId: string,
      taskId: string,
      query: { limit?: number; cursor?: string } = {},
    ) => unwrap(requireBridge().tasks.activity(workspaceId, taskId, query)),
    assignedToMe: (workspaceId: string) => unwrap(requireBridge().tasks.assignedToMe(workspaceId)),
  },
  // Decisions (Phase 6, workspace-scoped). The renderer passes only ids + inputs; the SERVER decides
  // workspace membership, project visibility/management, participant validity and lifecycle legality.
  // Owned sets (alternatives / references) use REPLACE semantics on update.
  decisions: {
    list: (workspaceId: string, query: DecisionListQuery = {}) =>
      unwrap(requireBridge().decisions.list(workspaceId, query)),
    create: (workspaceId: string, input: CreateDecisionInput) =>
      unwrap(requireBridge().decisions.create(workspaceId, input)),
    get: (workspaceId: string, decisionId: string) =>
      unwrap(requireBridge().decisions.get(workspaceId, decisionId)),
    update: (workspaceId: string, decisionId: string, input: UpdateDecisionInput) =>
      unwrap(requireBridge().decisions.update(workspaceId, decisionId, input)),
    remove: (workspaceId: string, decisionId: string) =>
      unwrap(requireBridge().decisions.remove(workspaceId, decisionId)),
    approve: (workspaceId: string, decisionId: string) =>
      unwrap(requireBridge().decisions.approve(workspaceId, decisionId)),
    reject: (workspaceId: string, decisionId: string) =>
      unwrap(requireBridge().decisions.reject(workspaceId, decisionId)),
    supersede: (workspaceId: string, decisionId: string, input: SupersedeDecisionInput) =>
      unwrap(requireBridge().decisions.supersede(workspaceId, decisionId, input)),
    archive: (workspaceId: string, decisionId: string) =>
      unwrap(requireBridge().decisions.archive(workspaceId, decisionId)),
    restore: (workspaceId: string, decisionId: string) =>
      unwrap(requireBridge().decisions.restore(workspaceId, decisionId)),
    addParticipant: (workspaceId: string, decisionId: string, input: DecisionParticipantInput) =>
      unwrap(requireBridge().decisions.addParticipant(workspaceId, decisionId, input)),
    removeParticipant: (workspaceId: string, decisionId: string, userId: string) =>
      unwrap(requireBridge().decisions.removeParticipant(workspaceId, decisionId, userId)),
    history: (
      workspaceId: string,
      decisionId: string,
      query: { limit?: number; cursor?: string } = {},
    ) => unwrap(requireBridge().decisions.history(workspaceId, decisionId, query)),
    listComments: (
      workspaceId: string,
      decisionId: string,
      query: { limit?: number; cursor?: string } = {},
    ) => unwrap(requireBridge().decisions.listComments(workspaceId, decisionId, query)),
    addComment: (workspaceId: string, decisionId: string, input: CreateDecisionCommentInput) =>
      unwrap(requireBridge().decisions.addComment(workspaceId, decisionId, input)),
    deleteComment: (workspaceId: string, decisionId: string, commentId: string) =>
      unwrap(requireBridge().decisions.deleteComment(workspaceId, decisionId, commentId)),
  },
};
