/**
 * Desktop (Electron) contracts shared between the main process, the typed preload bridge,
 * and the renderer. Kept in `@buildtogether/shared` so both sides of the IPC boundary
 * compile against the same types (frontend-engineering + security-review rules).
 *
 * SECURITY: this describes only the *minimal, allowlisted* surface exposed to the renderer.
 * Raw `ipcRenderer` / Node APIs are never exposed. **Clerk's long-lived client tokens NEVER reach
 * the renderer or this bridge** — Clerk's own Electron storage (safeStorage-encrypted, main process)
 * owns them. The renderer obtains only a SHORT-LIVED session JWT from `@clerk/electron/react`
 * `getToken()` and hands THAT to the trusted main process via `auth.syncToken`; main then attaches it
 * to every API call, so the main process remains the sole authenticated API caller (ADR-0003/ADR-0006).
 */

import type {
  AcceptInvitationInput,
  AuthSessionView,
  CreateInvitationInput,
  CreateWorkspaceInput,
  CreatedInvitation,
  InvitationSummary,
  MemberSummary,
  PublicUser,
  UpdateProfileInput,
  UpdateWorkspaceInput,
  WorkspaceRole,
  WorkspaceSummary,
} from './domain';
import type { ChatToken, ConversationSummary, CreateConversationInput } from './chat';
import type {
  CreateProjectInput,
  ProjectListQuery,
  ProjectOverview,
  ProjectView,
  UpdateProjectInput,
} from './projects';
import type {
  AddTaskDependencyInput,
  AssignTaskInput,
  ChangeTaskStatusInput,
  CreateTaskInput,
  MyTaskView,
  TaskActivityView,
  TaskDependencies,
  TaskListQuery,
  TaskView,
  UpdateTaskInput,
} from './tasks';
import type {
  CreateDecisionCommentInput,
  CreateDecisionInput,
  DecisionCommentView,
  DecisionDetailView,
  DecisionHistoryView,
  DecisionListQuery,
  DecisionParticipantInput,
  DecisionView,
  SupersedeDecisionInput,
  UpdateDecisionInput,
} from './decisions';

/** Non-secret runtime configuration the main process resolves and hands to the renderer. */
export interface DesktopConfig {
  /** Base URL of the remote BuildTogether API. Environment-aware; never a hardcoded prod localhost. */
  apiBaseUrl: string;
  /** Application version (from package metadata). */
  appVersion: string;
  /** Host platform reported by Electron (`process.platform`). */
  platform: string;
}

/** Structured error the main process returns to the renderer for a failed IPC operation. */
export interface IpcError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

/** Every bridge method resolves to a discriminated outcome, never a thrown remote error. */
export type IpcOutcome<T> = { ok: true; data: T } | { ok: false; error: IpcError };

/** The API surface the preload bridge exposes on `window.bt`. */
export interface DesktopBridge {
  getConfig(): Promise<DesktopConfig>;
  getPlatformInfo(): Promise<{ platform: string; arch: string }>;
  openExternal(url: string): Promise<{ ok: boolean; reason?: string }>;
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
  };
  /**
   * Clerk owns authentication: the renderer drives sign up/in, email verification and password
   * reset through `@clerk/electron/react` hooks (never this bridge). Once Clerk has a session, the
   * renderer obtains a short-lived session JWT via `getToken()` and pushes it here so main can use
   * it as the API bearer token; `null` clears it (sign-out). No long-lived credential crosses here.
   */
  auth: {
    /** Sync the current short-lived Clerk session JWT to the trusted main process (null ⇒ clear). */
    syncToken(token: string | null): Promise<IpcOutcome<null>>;
    /** Current session view, or data null when main holds no valid/verified Clerk session. */
    me(): Promise<IpcOutcome<AuthSessionView | null>>;
  };
  users: {
    updateMe(input: UpdateProfileInput): Promise<IpcOutcome<PublicUser>>;
  };
  workspaces: {
    list(): Promise<IpcOutcome<WorkspaceSummary[]>>;
    create(input: CreateWorkspaceInput): Promise<IpcOutcome<WorkspaceSummary>>;
    get(workspaceId: string): Promise<IpcOutcome<WorkspaceSummary>>;
    update(workspaceId: string, input: UpdateWorkspaceInput): Promise<IpcOutcome<WorkspaceSummary>>;
  };
  members: {
    list(workspaceId: string): Promise<IpcOutcome<MemberSummary[]>>;
    updateRole(
      workspaceId: string,
      memberId: string,
      role: WorkspaceRole,
    ): Promise<IpcOutcome<null>>;
    remove(workspaceId: string, memberId: string): Promise<IpcOutcome<null>>;
    transfer(workspaceId: string, memberId: string): Promise<IpcOutcome<null>>;
  };
  invitations: {
    create(
      workspaceId: string,
      input: CreateInvitationInput,
    ): Promise<IpcOutcome<CreatedInvitation>>;
    list(workspaceId: string): Promise<IpcOutcome<InvitationSummary[]>>;
    revoke(workspaceId: string, invitationId: string): Promise<IpcOutcome<null>>;
    accept(input: AcceptInvitationInput): Promise<IpcOutcome<WorkspaceSummary>>;
    pendingForMe(): Promise<IpcOutcome<InvitationSummary[]>>;
  };
  /**
   * Phase 3 chat APP-LEVEL operations only (workspace-scoped; the trusted main process attaches the BT
   * session and the server authorizes). Realtime MESSAGE transport is NOT here — the renderer drives
   * Nexconn directly via Web IMLib using the short-lived per-user token returned by `getToken`
   * (ADR-0004). BT session tokens never cross this boundary; only the ephemeral Nexconn client token does.
   */
  chat: {
    getToken(workspaceId: string): Promise<IpcOutcome<ChatToken>>;
    listConversations(workspaceId: string): Promise<IpcOutcome<ConversationSummary[]>>;
    createConversation(
      workspaceId: string,
      input: CreateConversationInput,
    ): Promise<IpcOutcome<ConversationSummary>>;
    getConversation(
      workspaceId: string,
      conversationId: string,
    ): Promise<IpcOutcome<ConversationSummary>>;
    addMembers(
      workspaceId: string,
      conversationId: string,
      userIds: string[],
    ): Promise<IpcOutcome<ConversationSummary>>;
    removeMember(
      workspaceId: string,
      conversationId: string,
      userId: string,
    ): Promise<IpcOutcome<null>>;
  };
  /**
   * Phase 4 projects (workspace-scoped). The renderer passes only ids + inputs; the trusted main
   * process attaches the session and the SERVER decides membership/role/ownership on every call. The
   * list query is a plain DTO (the main process rebuilds a safe query string) — search / filter /
   * scope are applied server-side, never in the renderer.
   */
  projects: {
    list(workspaceId: string, query: ProjectListQuery): Promise<IpcOutcome<ProjectView[]>>;
    create(workspaceId: string, input: CreateProjectInput): Promise<IpcOutcome<ProjectView>>;
    getOverview(workspaceId: string, projectId: string): Promise<IpcOutcome<ProjectOverview>>;
    update(
      workspaceId: string,
      projectId: string,
      input: UpdateProjectInput,
    ): Promise<IpcOutcome<ProjectView>>;
    archive(workspaceId: string, projectId: string): Promise<IpcOutcome<ProjectView>>;
    restore(workspaceId: string, projectId: string): Promise<IpcOutcome<ProjectView>>;
  };
  /**
   * Phase 5 tasks (workspace- and project-scoped). Same trust model as projects: the renderer passes
   * only ids + inputs; the trusted main process attaches the session and the SERVER decides workspace
   * membership, project visibility/ownership, assignee validity and dependency legality on every call.
   * `list`/`activity` are paginated; `assignedToMe` powers My Work across the caller's visible projects.
   */
  tasks: {
    list(
      workspaceId: string,
      projectId: string,
      query: TaskListQuery,
    ): Promise<IpcOutcome<TaskView[]>>;
    create(
      workspaceId: string,
      projectId: string,
      input: CreateTaskInput,
    ): Promise<IpcOutcome<TaskView>>;
    get(workspaceId: string, taskId: string): Promise<IpcOutcome<TaskView>>;
    update(
      workspaceId: string,
      taskId: string,
      input: UpdateTaskInput,
    ): Promise<IpcOutcome<TaskView>>;
    remove(workspaceId: string, taskId: string): Promise<IpcOutcome<null>>;
    assign(
      workspaceId: string,
      taskId: string,
      input: AssignTaskInput,
    ): Promise<IpcOutcome<TaskView>>;
    changeStatus(
      workspaceId: string,
      taskId: string,
      input: ChangeTaskStatusInput,
    ): Promise<IpcOutcome<TaskView>>;
    dependencies(workspaceId: string, taskId: string): Promise<IpcOutcome<TaskDependencies>>;
    addDependency(
      workspaceId: string,
      taskId: string,
      input: AddTaskDependencyInput,
    ): Promise<IpcOutcome<TaskDependencies>>;
    removeDependency(
      workspaceId: string,
      taskId: string,
      dependencyId: string,
    ): Promise<IpcOutcome<TaskDependencies>>;
    activity(
      workspaceId: string,
      taskId: string,
      query: { limit?: number; cursor?: string },
    ): Promise<IpcOutcome<TaskActivityView[]>>;
    assignedToMe(workspaceId: string): Promise<IpcOutcome<MyTaskView[]>>;
  };
  /**
   * Phase 6 Decision Vault (workspace-scoped). Same trust model as projects/tasks: the renderer passes
   * only ids + inputs; the trusted main process attaches the session and the SERVER decides workspace
   * membership, project visibility/management, participant validity and lifecycle legality on every
   * call. `list`/`history`/`comments` are paginated; owned sets (alternatives/references) use REPLACE
   * semantics on update.
   */
  decisions: {
    list(workspaceId: string, query: DecisionListQuery): Promise<IpcOutcome<DecisionView[]>>;
    create(
      workspaceId: string,
      input: CreateDecisionInput,
    ): Promise<IpcOutcome<DecisionDetailView>>;
    get(workspaceId: string, decisionId: string): Promise<IpcOutcome<DecisionDetailView>>;
    update(
      workspaceId: string,
      decisionId: string,
      input: UpdateDecisionInput,
    ): Promise<IpcOutcome<DecisionDetailView>>;
    remove(workspaceId: string, decisionId: string): Promise<IpcOutcome<null>>;
    /** DRAFT/PROPOSED → APPROVED. Server requires a non-empty decision statement. */
    approve(workspaceId: string, decisionId: string): Promise<IpcOutcome<DecisionDetailView>>;
    /** PROPOSED → REJECTED. Rejected decisions stay readable for historical reference. */
    reject(workspaceId: string, decisionId: string): Promise<IpcOutcome<DecisionDetailView>>;
    supersede(
      workspaceId: string,
      decisionId: string,
      input: SupersedeDecisionInput,
    ): Promise<IpcOutcome<DecisionDetailView>>;
    archive(workspaceId: string, decisionId: string): Promise<IpcOutcome<DecisionDetailView>>;
    restore(workspaceId: string, decisionId: string): Promise<IpcOutcome<DecisionDetailView>>;
    addParticipant(
      workspaceId: string,
      decisionId: string,
      input: DecisionParticipantInput,
    ): Promise<IpcOutcome<DecisionDetailView>>;
    removeParticipant(
      workspaceId: string,
      decisionId: string,
      userId: string,
    ): Promise<IpcOutcome<DecisionDetailView>>;
    history(
      workspaceId: string,
      decisionId: string,
      query: { limit?: number; cursor?: string },
    ): Promise<IpcOutcome<DecisionHistoryView[]>>;
    listComments(
      workspaceId: string,
      decisionId: string,
      query: { limit?: number; cursor?: string },
    ): Promise<IpcOutcome<DecisionCommentView[]>>;
    addComment(
      workspaceId: string,
      decisionId: string,
      input: CreateDecisionCommentInput,
    ): Promise<IpcOutcome<DecisionCommentView>>;
    deleteComment(
      workspaceId: string,
      decisionId: string,
      commentId: string,
    ): Promise<IpcOutcome<null>>;
  };
}

/** IPC channel names. Single source of truth so main and preload cannot drift. */
export const IPC = {
  GET_CONFIG: 'app:get-config',
  GET_PLATFORM_INFO: 'app:get-platform-info',
  OPEN_EXTERNAL: 'app:open-external',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  WINDOW_CLOSE: 'window:close',
  // Auth (Clerk owns credentials; this bridge only syncs the short-lived session JWT + reads `me`)
  AUTH_SYNC_TOKEN: 'auth:sync-token',
  AUTH_ME: 'auth:me',
  // Users
  USERS_UPDATE_ME: 'users:update-me',
  // Workspaces
  WORKSPACES_LIST: 'workspaces:list',
  WORKSPACES_CREATE: 'workspaces:create',
  WORKSPACES_GET: 'workspaces:get',
  WORKSPACES_UPDATE: 'workspaces:update',
  // Members
  MEMBERS_LIST: 'members:list',
  MEMBERS_UPDATE_ROLE: 'members:update-role',
  MEMBERS_REMOVE: 'members:remove',
  MEMBERS_TRANSFER: 'members:transfer',
  // Invitations
  INVITATIONS_CREATE: 'invitations:create',
  INVITATIONS_LIST: 'invitations:list',
  INVITATIONS_REVOKE: 'invitations:revoke',
  INVITATIONS_ACCEPT: 'invitations:accept',
  INVITATIONS_PENDING_FOR_ME: 'invitations:pending-for-me',
  // Chat (Phase 3 — app-level, workspace-scoped; provider message transport stays in the renderer)
  CHAT_GET_TOKEN: 'chat:get-token',
  CHAT_LIST_CONVERSATIONS: 'chat:list-conversations',
  CHAT_CREATE_CONVERSATION: 'chat:create-conversation',
  CHAT_GET_CONVERSATION: 'chat:get-conversation',
  CHAT_ADD_MEMBERS: 'chat:add-members',
  CHAT_REMOVE_MEMBER: 'chat:remove-member',
  // Projects (Phase 4 — workspace-scoped; server-authoritative)
  PROJECTS_LIST: 'projects:list',
  PROJECTS_CREATE: 'projects:create',
  PROJECTS_GET_OVERVIEW: 'projects:get-overview',
  PROJECTS_UPDATE: 'projects:update',
  PROJECTS_ARCHIVE: 'projects:archive',
  PROJECTS_RESTORE: 'projects:restore',
  // Tasks (Phase 5 — workspace- and project-scoped; server-authoritative)
  TASKS_LIST: 'tasks:list',
  TASKS_CREATE: 'tasks:create',
  TASKS_GET: 'tasks:get',
  TASKS_UPDATE: 'tasks:update',
  TASKS_REMOVE: 'tasks:remove',
  TASKS_ASSIGN: 'tasks:assign',
  TASKS_CHANGE_STATUS: 'tasks:change-status',
  TASKS_DEPENDENCIES: 'tasks:dependencies',
  TASKS_ADD_DEPENDENCY: 'tasks:add-dependency',
  TASKS_REMOVE_DEPENDENCY: 'tasks:remove-dependency',
  TASKS_ACTIVITY: 'tasks:activity',
  TASKS_ASSIGNED_TO_ME: 'tasks:assigned-to-me',
  // Decisions (Phase 6 — Decision Vault; workspace-scoped, server-authoritative)
  DECISIONS_LIST: 'decisions:list',
  DECISIONS_CREATE: 'decisions:create',
  DECISIONS_GET: 'decisions:get',
  DECISIONS_UPDATE: 'decisions:update',
  DECISIONS_REMOVE: 'decisions:remove',
  DECISIONS_APPROVE: 'decisions:approve',
  DECISIONS_REJECT: 'decisions:reject',
  DECISIONS_SUPERSEDE: 'decisions:supersede',
  DECISIONS_ARCHIVE: 'decisions:archive',
  DECISIONS_RESTORE: 'decisions:restore',
  DECISIONS_ADD_PARTICIPANT: 'decisions:add-participant',
  DECISIONS_REMOVE_PARTICIPANT: 'decisions:remove-participant',
  DECISIONS_HISTORY: 'decisions:history',
  DECISIONS_LIST_COMMENTS: 'decisions:list-comments',
  DECISIONS_ADD_COMMENT: 'decisions:add-comment',
  DECISIONS_DELETE_COMMENT: 'decisions:delete-comment',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
