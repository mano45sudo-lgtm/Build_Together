import type {
  AcceptInvitationInput,
  AddTaskDependencyInput,
  ApiResponse,
  AssignTaskInput,
  AuthSessionView,
  ChangeTaskStatusInput,
  ChatToken,
  CreateConversationInput,
  CreateDecisionCommentInput,
  CreateDecisionInput,
  CreateInvitationInput,
  CreateProjectInput,
  CreateTaskInput,
  CreateWorkspaceInput,
  ConversationSummary,
  CreatedInvitation,
  DecisionCommentView,
  DecisionDetailView,
  DecisionHistoryView,
  DecisionListQuery,
  DecisionParticipantInput,
  DecisionView,
  InvitationSummary,
  MemberSummary,
  MyTaskView,
  ProjectListQuery,
  ProjectOverview,
  ProjectView,
  PublicUser,
  SupersedeDecisionInput,
  TaskActivityView,
  TaskDependencies,
  TaskListQuery,
  TaskView,
  UpdateDecisionInput,
  UpdateProfileInput,
  UpdateProjectInput,
  UpdateTaskInput,
  UpdateWorkspaceInput,
  WorkspaceRole,
  WorkspaceSummary,
} from '@buildtogether/shared';
import {
  DECISION_CATEGORIES,
  DECISION_SOURCES,
  DECISION_SORT_FIELDS,
  DECISION_STATUSES,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
  TASK_SORT_FIELDS,
  TASK_STATUSES,
} from '@buildtogether/shared';
import { resolveApiBaseUrl } from './config';
import { getClerkToken } from './session-store';

/**
 * The trusted main-process API client (ADR-0003 §4, §11; ADR-0006). This is the ONLY place that talks
 * to the BuildTogether API for authenticated operations: it attaches the short-lived Clerk session JWT
 * (synced by the renderer over `auth.syncToken`) as the bearer token. Clerk owns authentication, so
 * there are NO credential/refresh endpoints here — the server verifies the Clerk JWT on every call and
 * resolves it to the internal identity. If the token has expired the server returns `401`; we surface
 * that rather than silently retrying, so the renderer refreshes via Clerk `getToken()` and re-syncs.
 *
 * Only the sanitized view (`AuthSessionView` / domain DTOs) is returned to callers; the token is never
 * read back out of the store. Network + API failures surface as `ApiRequestError` so the IPC layer can
 * translate them into the safe `IpcOutcome` envelope.
 */

export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

const V1 = '/api/v1';

/** Low-level fetch that never throws on a bad HTTP status — returns status + parsed envelope. */
async function call(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; env: ApiResponse<unknown> }> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  let res: Response;
  try {
    res = await fetch(resolveApiBaseUrl() + path, init);
  } catch (error) {
    throw new ApiRequestError(
      'NETWORK_ERROR',
      error instanceof Error ? error.message : 'Network request failed',
    );
  }

  const env = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
  return {
    status: res.status,
    env: env ?? {
      data: null,
      error: { code: 'EMPTY_RESPONSE', message: 'Empty response from API' },
    },
  };
}

function toError(status: number, env: ApiResponse<unknown>): ApiRequestError {
  if (env.error) return new ApiRequestError(env.error.code, env.error.message, env.error.details);
  return new ApiRequestError('REQUEST_FAILED', `Request failed (${status})`);
}

/**
 * Authenticated request: attach the current short-lived Clerk session JWT held in main (synced by the
 * renderer). Clerk owns token refresh, so there is no 401-refresh-replay here — an expired token means
 * the renderer's next `getToken()`/`auth.syncToken` cycle delivers a fresh one; we surface the server's
 * `401` unchanged so the server stays the authority on session validity.
 */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getClerkToken();
  if (!token) throw new ApiRequestError('UNAUTHENTICATED', 'You are not signed in');

  const { status, env } = await call(method, path, body, token);
  if (env.error || env.data === null) throw toError(status, env);
  return env.data as T;
}

// ---- Auth ----

export const auth = {
  async me(): Promise<AuthSessionView | null> {
    if (!getClerkToken()) return null;
    try {
      return await request<AuthSessionView>('GET', `${V1}/auth/me`);
    } catch (error) {
      // A rejected Clerk session token (expired/invalid) means signed out from the app's perspective.
      if (
        error instanceof ApiRequestError &&
        (error.code === 'UNAUTHENTICATED' || error.code === 'INVALID_SESSION')
      ) {
        return null;
      }
      throw error;
    }
  },
};

// ---- Users ----

export const users = {
  updateMe: (input: UpdateProfileInput): Promise<PublicUser> =>
    request<PublicUser>('PATCH', `${V1}/users/me`, input),
};

// ---- Workspaces ----

export const workspaces = {
  list: (): Promise<WorkspaceSummary[]> => request<WorkspaceSummary[]>('GET', `${V1}/workspaces`),
  create: (input: CreateWorkspaceInput): Promise<WorkspaceSummary> =>
    request<WorkspaceSummary>('POST', `${V1}/workspaces`, input),
  get: (workspaceId: string): Promise<WorkspaceSummary> =>
    request<WorkspaceSummary>('GET', `${V1}/workspaces/${workspaceId}`),
  update: (workspaceId: string, input: UpdateWorkspaceInput): Promise<WorkspaceSummary> =>
    request<WorkspaceSummary>('PATCH', `${V1}/workspaces/${workspaceId}`, input),
};

// ---- Members ----

export const members = {
  list: (workspaceId: string): Promise<MemberSummary[]> =>
    request<MemberSummary[]>('GET', `${V1}/workspaces/${workspaceId}/members`),
  updateRole: (workspaceId: string, memberId: string, role: WorkspaceRole): Promise<null> =>
    request<null>('PATCH', `${V1}/workspaces/${workspaceId}/members/${memberId}`, { role }),
  remove: (workspaceId: string, memberId: string): Promise<null> =>
    request<null>('DELETE', `${V1}/workspaces/${workspaceId}/members/${memberId}`),
  transfer: (workspaceId: string, memberId: string): Promise<null> =>
    request<null>('POST', `${V1}/workspaces/${workspaceId}/members/${memberId}/transfer`),
};

// ---- Invitations ----

export const invitations = {
  create: (workspaceId: string, input: CreateInvitationInput): Promise<CreatedInvitation> =>
    request<CreatedInvitation>('POST', `${V1}/workspaces/${workspaceId}/invitations`, input),
  list: (workspaceId: string): Promise<InvitationSummary[]> =>
    request<InvitationSummary[]>('GET', `${V1}/workspaces/${workspaceId}/invitations`),
  revoke: (workspaceId: string, invitationId: string): Promise<null> =>
    request<null>('DELETE', `${V1}/workspaces/${workspaceId}/invitations/${invitationId}`),
  accept: (input: AcceptInvitationInput): Promise<WorkspaceSummary> =>
    request<WorkspaceSummary>('POST', `${V1}/invitations/accept`, input),
  pendingForMe: (): Promise<InvitationSummary[]> =>
    request<InvitationSummary[]>('GET', `${V1}/invitations/pending`),
};

// ---- Chat (Phase 3, app-level only) ----
// Conversation metadata + the ephemeral Nexconn client token. The token is a PER-USER, SHORT-LIVED
// provider credential (NOT the BT session) and is safe to hand to the renderer so Web IMLib can
// connect; BT access/refresh tokens still never leave this process (ADR-0003/ADR-0004).

export const chat = {
  getToken: (workspaceId: string): Promise<ChatToken> =>
    request<ChatToken>('GET', `${V1}/workspaces/${workspaceId}/chat/token`),
  listConversations: (workspaceId: string): Promise<ConversationSummary[]> =>
    request<ConversationSummary[]>('GET', `${V1}/workspaces/${workspaceId}/conversations`),
  createConversation: (
    workspaceId: string,
    input: CreateConversationInput,
  ): Promise<ConversationSummary> =>
    request<ConversationSummary>('POST', `${V1}/workspaces/${workspaceId}/conversations`, input),
  getConversation: (workspaceId: string, conversationId: string): Promise<ConversationSummary> =>
    request<ConversationSummary>(
      'GET',
      `${V1}/workspaces/${workspaceId}/conversations/${conversationId}`,
    ),
  addMembers: (
    workspaceId: string,
    conversationId: string,
    userIds: string[],
  ): Promise<ConversationSummary> =>
    request<ConversationSummary>(
      'POST',
      `${V1}/workspaces/${workspaceId}/conversations/${conversationId}/members`,
      { userIds },
    ),
  removeMember: (workspaceId: string, conversationId: string, userId: string): Promise<null> =>
    request<null>(
      'DELETE',
      `${V1}/workspaces/${workspaceId}/conversations/${conversationId}/members/${userId}`,
    ),
};

// ---- Projects (Phase 4, workspace-scoped; server-authoritative) ----
// The renderer supplies a `ProjectListQuery` DTO, but a query string is rebuilt here from a strict
// allowlist so a compromised renderer cannot smuggle arbitrary params. The server re-validates every
// value regardless; this is defense-in-depth at the IPC/HTTP boundary.

const SCOPES = ['active', 'archived', 'all'] as const;
const SORTS = ['createdAt', 'updatedAt', 'name'] as const;
const DIRS = ['asc', 'desc'] as const;

function buildProjectQuery(query: ProjectListQuery): string {
  const params = new URLSearchParams();
  if (query.scope && (SCOPES as readonly string[]).includes(query.scope)) {
    params.set('scope', query.scope);
  }
  if (query.status && (PROJECT_STATUSES as readonly string[]).includes(query.status)) {
    params.set('status', query.status);
  }
  if (query.search && query.search.trim().length > 0) {
    params.set('search', query.search.trim().slice(0, 120));
  }
  if (query.sort && (SORTS as readonly string[]).includes(query.sort)) {
    params.set('sort', query.sort);
  }
  if (query.dir && (DIRS as readonly string[]).includes(query.dir)) {
    params.set('dir', query.dir);
  }
  if (typeof query.limit === 'number' && Number.isInteger(query.limit)) {
    params.set('limit', String(Math.min(100, Math.max(1, query.limit))));
  }
  if (query.cursor && typeof query.cursor === 'string' && query.cursor.length <= 512) {
    params.set('cursor', query.cursor);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const projects = {
  list: (workspaceId: string, query: ProjectListQuery): Promise<ProjectView[]> =>
    request<ProjectView[]>(
      'GET',
      `${V1}/workspaces/${workspaceId}/projects${buildProjectQuery(query)}`,
    ),
  create: (workspaceId: string, input: CreateProjectInput): Promise<ProjectView> =>
    request<ProjectView>('POST', `${V1}/workspaces/${workspaceId}/projects`, input),
  getOverview: (workspaceId: string, projectId: string): Promise<ProjectOverview> =>
    request<ProjectOverview>(
      'GET',
      `${V1}/workspaces/${workspaceId}/projects/${projectId}/overview`,
    ),
  update: (
    workspaceId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<ProjectView> =>
    request<ProjectView>('PATCH', `${V1}/workspaces/${workspaceId}/projects/${projectId}`, input),
  archive: (workspaceId: string, projectId: string): Promise<ProjectView> =>
    request<ProjectView>('POST', `${V1}/workspaces/${workspaceId}/projects/${projectId}/archive`),
  restore: (workspaceId: string, projectId: string): Promise<ProjectView> =>
    request<ProjectView>('POST', `${V1}/workspaces/${workspaceId}/projects/${projectId}/restore`),
};

// ---- Tasks (Phase 5, workspace- + project-scoped; server-authoritative) ----
// Same defense-in-depth as projects: a task list query DTO is rebuilt here from a strict allowlist so a
// compromised renderer cannot smuggle arbitrary params. Every id is validated by the IPC layer before
// reaching this client, and the server re-derives membership / project boundary / legality regardless.

function buildTaskQuery(query: TaskListQuery): string {
  const params = new URLSearchParams();
  if (query.status && (TASK_STATUSES as readonly string[]).includes(query.status)) {
    params.set('status', query.status);
  }
  if (query.priority && (TASK_PRIORITIES as readonly string[]).includes(query.priority)) {
    params.set('priority', query.priority);
  }
  if (query.assigneeId && /^[A-Za-z0-9_-]+$/.test(query.assigneeId)) {
    params.set('assigneeId', query.assigneeId);
  }
  if (query.unassigned === true) params.set('unassigned', 'true');
  if (query.search && query.search.trim().length > 0) {
    params.set('search', query.search.trim().slice(0, 120));
  }
  if (query.sort && (TASK_SORT_FIELDS as readonly string[]).includes(query.sort)) {
    params.set('sort', query.sort);
  }
  if (query.dir === 'asc' || query.dir === 'desc') params.set('dir', query.dir);
  if (typeof query.limit === 'number' && Number.isInteger(query.limit)) {
    params.set('limit', String(Math.min(100, Math.max(1, query.limit))));
  }
  if (query.cursor && typeof query.cursor === 'string' && query.cursor.length <= 512) {
    params.set('cursor', query.cursor);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

const ws = (workspaceId: string): string => `${V1}/workspaces/${workspaceId}`;

export const tasks = {
  list: (workspaceId: string, projectId: string, query: TaskListQuery): Promise<TaskView[]> =>
    request<TaskView[]>(
      'GET',
      `${ws(workspaceId)}/projects/${projectId}/tasks${buildTaskQuery(query)}`,
    ),
  create: (workspaceId: string, projectId: string, input: CreateTaskInput): Promise<TaskView> =>
    request<TaskView>('POST', `${ws(workspaceId)}/projects/${projectId}/tasks`, input),
  get: (workspaceId: string, taskId: string): Promise<TaskView> =>
    request<TaskView>('GET', `${ws(workspaceId)}/tasks/${taskId}`),
  update: (workspaceId: string, taskId: string, input: UpdateTaskInput): Promise<TaskView> =>
    request<TaskView>('PATCH', `${ws(workspaceId)}/tasks/${taskId}`, input),
  remove: (workspaceId: string, taskId: string): Promise<null> =>
    request<null>('DELETE', `${ws(workspaceId)}/tasks/${taskId}`),
  assign: (workspaceId: string, taskId: string, input: AssignTaskInput): Promise<TaskView> =>
    request<TaskView>('PATCH', `${ws(workspaceId)}/tasks/${taskId}/assignee`, input),
  changeStatus: (
    workspaceId: string,
    taskId: string,
    input: ChangeTaskStatusInput,
  ): Promise<TaskView> =>
    request<TaskView>('PATCH', `${ws(workspaceId)}/tasks/${taskId}/status`, input),
  dependencies: (workspaceId: string, taskId: string): Promise<TaskDependencies> =>
    request<TaskDependencies>('GET', `${ws(workspaceId)}/tasks/${taskId}/dependencies`),
  addDependency: (
    workspaceId: string,
    taskId: string,
    input: AddTaskDependencyInput,
  ): Promise<TaskDependencies> =>
    request<TaskDependencies>('POST', `${ws(workspaceId)}/tasks/${taskId}/dependencies`, input),
  removeDependency: (
    workspaceId: string,
    taskId: string,
    dependencyId: string,
  ): Promise<TaskDependencies> =>
    request<TaskDependencies>(
      'DELETE',
      `${ws(workspaceId)}/tasks/${taskId}/dependencies/${dependencyId}`,
    ),
  activity: (
    workspaceId: string,
    taskId: string,
    query: { limit?: number; cursor?: string },
  ): Promise<TaskActivityView[]> => {
    const params = new URLSearchParams();
    if (typeof query.limit === 'number' && Number.isInteger(query.limit)) {
      params.set('limit', String(Math.min(100, Math.max(1, query.limit))));
    }
    if (query.cursor && typeof query.cursor === 'string' && query.cursor.length <= 512) {
      params.set('cursor', query.cursor);
    }
    const qs = params.toString();
    return request<TaskActivityView[]>(
      'GET',
      `${ws(workspaceId)}/tasks/${taskId}/activity${qs ? `?${qs}` : ''}`,
    );
  },
  assignedToMe: (workspaceId: string): Promise<MyTaskView[]> =>
    request<MyTaskView[]>('GET', `${ws(workspaceId)}/tasks/assigned-to-me`),
};

// ---- Decisions (Phase 6, workspace-scoped; server-authoritative) ----
// Same defense-in-depth as projects/tasks: the list-query DTO is rebuilt from a strict allowlist so a
// compromised renderer cannot smuggle arbitrary params. Every id is validated by the IPC layer, and
// the server re-derives membership / project visibility / lifecycle legality regardless.

function buildDecisionQuery(query: DecisionListQuery): string {
  const params = new URLSearchParams();
  if (query.status && (DECISION_STATUSES as readonly string[]).includes(query.status)) {
    params.set('status', query.status);
  }
  if (query.category && (DECISION_CATEGORIES as readonly string[]).includes(query.category)) {
    params.set('category', query.category);
  }
  if (query.projectId && /^[A-Za-z0-9_-]+$/.test(query.projectId)) {
    params.set('projectId', query.projectId);
  }
  if (query.source && (DECISION_SOURCES as readonly string[]).includes(query.source)) {
    params.set('source', query.source);
  }
  if (query.participantId && /^[A-Za-z0-9_-]+$/.test(query.participantId)) {
    params.set('participantId', query.participantId);
  }
  if (query.ownerId && /^[A-Za-z0-9_-]+$/.test(query.ownerId)) {
    params.set('ownerId', query.ownerId);
  }
  if (query.search && query.search.trim().length > 0) {
    params.set('search', query.search.trim().slice(0, 120));
  }
  if (query.sort && (DECISION_SORT_FIELDS as readonly string[]).includes(query.sort)) {
    params.set('sort', query.sort);
  }
  if (query.dir === 'asc' || query.dir === 'desc') params.set('dir', query.dir);
  if (typeof query.limit === 'number' && Number.isInteger(query.limit)) {
    params.set('limit', String(Math.min(100, Math.max(1, query.limit))));
  }
  if (query.cursor && typeof query.cursor === 'string' && query.cursor.length <= 512) {
    params.set('cursor', query.cursor);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Feed pagination for history + comments (limit + opaque cursor only). */
function buildFeedQuery(query: { limit?: number; cursor?: string }): string {
  const params = new URLSearchParams();
  if (typeof query.limit === 'number' && Number.isInteger(query.limit)) {
    params.set('limit', String(Math.min(100, Math.max(1, query.limit))));
  }
  if (query.cursor && typeof query.cursor === 'string' && query.cursor.length <= 512) {
    params.set('cursor', query.cursor);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export const decisions = {
  list: (workspaceId: string, query: DecisionListQuery): Promise<DecisionView[]> =>
    request<DecisionView[]>('GET', `${ws(workspaceId)}/decisions${buildDecisionQuery(query)}`),
  create: (workspaceId: string, input: CreateDecisionInput): Promise<DecisionDetailView> =>
    request<DecisionDetailView>('POST', `${ws(workspaceId)}/decisions`, input),
  get: (workspaceId: string, decisionId: string): Promise<DecisionDetailView> =>
    request<DecisionDetailView>('GET', `${ws(workspaceId)}/decisions/${decisionId}`),
  update: (
    workspaceId: string,
    decisionId: string,
    input: UpdateDecisionInput,
  ): Promise<DecisionDetailView> =>
    request<DecisionDetailView>('PATCH', `${ws(workspaceId)}/decisions/${decisionId}`, input),
  remove: (workspaceId: string, decisionId: string): Promise<null> =>
    request<null>('DELETE', `${ws(workspaceId)}/decisions/${decisionId}`),
  approve: (workspaceId: string, decisionId: string): Promise<DecisionDetailView> =>
    request<DecisionDetailView>('POST', `${ws(workspaceId)}/decisions/${decisionId}/approve`),
  reject: (workspaceId: string, decisionId: string): Promise<DecisionDetailView> =>
    request<DecisionDetailView>('POST', `${ws(workspaceId)}/decisions/${decisionId}/reject`),
  supersede: (
    workspaceId: string,
    decisionId: string,
    input: SupersedeDecisionInput,
  ): Promise<DecisionDetailView> =>
    request<DecisionDetailView>(
      'POST',
      `${ws(workspaceId)}/decisions/${decisionId}/supersede`,
      input,
    ),
  archive: (workspaceId: string, decisionId: string): Promise<DecisionDetailView> =>
    request<DecisionDetailView>('POST', `${ws(workspaceId)}/decisions/${decisionId}/archive`),
  restore: (workspaceId: string, decisionId: string): Promise<DecisionDetailView> =>
    request<DecisionDetailView>('POST', `${ws(workspaceId)}/decisions/${decisionId}/restore`),
  addParticipant: (
    workspaceId: string,
    decisionId: string,
    input: DecisionParticipantInput,
  ): Promise<DecisionDetailView> =>
    request<DecisionDetailView>(
      'POST',
      `${ws(workspaceId)}/decisions/${decisionId}/participants`,
      input,
    ),
  removeParticipant: (
    workspaceId: string,
    decisionId: string,
    userId: string,
  ): Promise<DecisionDetailView> =>
    request<DecisionDetailView>(
      'DELETE',
      `${ws(workspaceId)}/decisions/${decisionId}/participants/${userId}`,
    ),
  history: (
    workspaceId: string,
    decisionId: string,
    query: { limit?: number; cursor?: string },
  ): Promise<DecisionHistoryView[]> =>
    request<DecisionHistoryView[]>(
      'GET',
      `${ws(workspaceId)}/decisions/${decisionId}/history${buildFeedQuery(query)}`,
    ),
  listComments: (
    workspaceId: string,
    decisionId: string,
    query: { limit?: number; cursor?: string },
  ): Promise<DecisionCommentView[]> =>
    request<DecisionCommentView[]>(
      'GET',
      `${ws(workspaceId)}/decisions/${decisionId}/comments${buildFeedQuery(query)}`,
    ),
  addComment: (
    workspaceId: string,
    decisionId: string,
    input: CreateDecisionCommentInput,
  ): Promise<DecisionCommentView> =>
    request<DecisionCommentView>(
      'POST',
      `${ws(workspaceId)}/decisions/${decisionId}/comments`,
      input,
    ),
  deleteComment: (workspaceId: string, decisionId: string, commentId: string): Promise<null> =>
    request<null>('DELETE', `${ws(workspaceId)}/decisions/${decisionId}/comments/${commentId}`),
};
