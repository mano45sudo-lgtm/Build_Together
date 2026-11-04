import { BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type {
  AcceptInvitationInput,
  AddTaskDependencyInput,
  AssignTaskInput,
  ChangePasswordInput,
  ChangeTaskStatusInput,
  ConversationKind,
  CreateConversationInput,
  CreateDecisionCommentInput,
  CreateDecisionInput,
  CreateInvitationInput,
  CreateProjectInput,
  CreateTaskInput,
  CreateWorkspaceInput,
  DecisionAlternativeInput,
  DecisionListQuery,
  DecisionParticipantInput,
  DecisionReferenceInput,
  DecisionReferenceType,
  DecisionSortField,
  DecisionSource,
  DecisionStatus,
  IpcError,
  IpcOutcome,
  LoginInput,
  ProjectListQuery,
  ProjectStatus,
  ProjectVisibility,
  RegisterInput,
  SupersedeDecisionInput,
  TaskListQuery,
  TaskPriority,
  TaskSortField,
  TaskStatus,
  UpdateDecisionInput,
  UpdateProfileInput,
  UpdateProjectInput,
  UpdateTaskInput,
  UpdateWorkspaceInput,
  WorkspaceRole,
} from '@buildtogether/shared';
import {
  IPC,
  DECISION_REFERENCE_TYPES,
  DECISION_SORT_FIELDS,
  DECISION_SOURCES,
  DECISION_STATUSES,
  PROJECT_STATUSES,
  PROJECT_VISIBILITIES,
  ROLE_RANK,
  TASK_PRIORITIES,
  TASK_SORT_FIELDS,
  TASK_STATUSES,
} from '@buildtogether/shared';
import * as api from './api-client';
import { ApiRequestError } from './api-client';
import { resolveDesktopConfig, trustedRendererOrigin } from './config';
import { routeExternalUrl } from './security';

/**
 * IPC registration. Every handler validates that the calling frame is our own trusted
 * renderer origin (Electron security recommendation #17) AND that every argument is
 * well-formed before touching the API — the renderer is never trusted with raw tokens or
 * with unchecked input. All results are returned as a safe `IpcOutcome` (never a thrown
 * remote error), and any unexpected failure is reduced to a generic, non-leaky `IpcError`.
 */
function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const frame = event.senderFrame;
  const trusted = trustedRendererOrigin();
  if (!frame || frame.origin !== trusted) {
    throw new Error('untrusted IPC sender');
  }
}

function windowOf(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

// ---- argument guards (the IPC boundary is a trust boundary) ----

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' && value !== null) {
    throw new ApiRequestError('INVALID_ARGUMENT', 'Expected an object argument');
  }
  return value as Record<string, unknown>;
}

function reqStr(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiRequestError('INVALID_ARGUMENT', `${field} must be a non-empty string`);
  }
  return value.trim();
}

function optStr(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string')
    throw new ApiRequestError('INVALID_ARGUMENT', `${field} must be a string`);
  return value;
}

/**
 * A strict identifier guard for anything interpolated into an API path (workspaceId, conversationId,
 * userId). Beyond non-empty, it rejects any character outside `[A-Za-z0-9_-]` so a malicious renderer
 * cannot smuggle `/`, `?`, `#`, or `..` into a URL segment (path traversal / route confusion). Our ids
 * are cuids, which always pass.
 */
function reqId(value: unknown, field: string): string {
  const s = reqStr(value, field);
  if (!/^[A-Za-z0-9_-]+$/.test(s)) {
    throw new ApiRequestError('INVALID_ARGUMENT', `${field} is not a valid identifier`);
  }
  return s;
}

function reqIdArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new ApiRequestError('INVALID_ARGUMENT', `${field} must be an array`);
  }
  return value.map((item) => reqId(item, field));
}

const KINDS: readonly ConversationKind[] = ['GROUP', 'DIRECT'];
function reqKind(value: unknown): ConversationKind {
  if (typeof value !== 'string' || !KINDS.includes(value as ConversationKind)) {
    throw new ApiRequestError('INVALID_ARGUMENT', 'kind must be GROUP or DIRECT');
  }
  return value as ConversationKind;
}

const ROLES: readonly WorkspaceRole[] = ['OWNER', 'ADMIN', 'MEMBER'];
function reqRole(value: unknown): WorkspaceRole {
  if (typeof value !== 'string' || !ROLES.includes(value as WorkspaceRole)) {
    throw new ApiRequestError('INVALID_ARGUMENT', 'role must be OWNER, ADMIN or MEMBER');
  }
  return value as WorkspaceRole;
}

/** A string field that may be explicitly null (dates, icon, color) — distinct from "absent". */
function optStrOrNull(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new ApiRequestError('INVALID_ARGUMENT', `${field} must be a string or null`);
  }
  return value;
}

/** Constrain an optional enum-ish field to a closed vocabulary at the trust boundary. */
function optEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ApiRequestError('INVALID_ARGUMENT', `${field} is not a valid value`);
  }
  return value as T;
}

/** Build a CreateProjectInput from a raw IPC object (name required; the rest optional/validated). */
function buildCreateProject(o: Record<string, unknown>): CreateProjectInput {
  const payload: CreateProjectInput = { name: reqStr(o['name'], 'name') };
  const description = optStr(o['description'], 'description');
  if (description !== undefined) payload.description = description;
  const status = optEnum<ProjectStatus>(o['status'], 'status', PROJECT_STATUSES);
  if (status !== undefined) payload.status = status;
  const visibility = optEnum<ProjectVisibility>(
    o['visibility'],
    'visibility',
    PROJECT_VISIBILITIES,
  );
  if (visibility !== undefined) payload.visibility = visibility;
  if (o['ownerId'] !== undefined && o['ownerId'] !== null) {
    payload.ownerId = reqId(o['ownerId'], 'ownerId');
  }
  const projectKey = optStr(o['projectKey'], 'projectKey');
  if (projectKey !== undefined) payload.projectKey = projectKey;
  const startDate = optStrOrNull(o['startDate'], 'startDate');
  if (startDate !== undefined) payload.startDate = startDate;
  const targetDate = optStrOrNull(o['targetDate'], 'targetDate');
  if (targetDate !== undefined) payload.targetDate = targetDate;
  const icon = optStrOrNull(o['icon'], 'icon');
  if (icon !== undefined) payload.icon = icon;
  const color = optStrOrNull(o['color'], 'color');
  if (color !== undefined) payload.color = color;
  return payload;
}

/** Build an UpdateProjectInput; the server rejects an empty patch, so we just carry present fields. */
function buildUpdateProject(o: Record<string, unknown>): UpdateProjectInput {
  const payload: UpdateProjectInput = {};
  const name = optStr(o['name'], 'name');
  if (name !== undefined) payload.name = name;
  if ('description' in o)
    payload.description = optStrOrNull(o['description'], 'description') ?? null;
  const status = optEnum<ProjectStatus>(o['status'], 'status', PROJECT_STATUSES);
  if (status !== undefined) payload.status = status;
  const visibility = optEnum<ProjectVisibility>(
    o['visibility'],
    'visibility',
    PROJECT_VISIBILITIES,
  );
  if (visibility !== undefined) payload.visibility = visibility;
  if (o['ownerId'] !== undefined && o['ownerId'] !== null) {
    payload.ownerId = reqId(o['ownerId'], 'ownerId');
  }
  if ('startDate' in o) payload.startDate = optStrOrNull(o['startDate'], 'startDate') ?? null;
  if ('targetDate' in o) payload.targetDate = optStrOrNull(o['targetDate'], 'targetDate') ?? null;
  if ('icon' in o) payload.icon = optStrOrNull(o['icon'], 'icon') ?? null;
  if ('color' in o) payload.color = optStrOrNull(o['color'], 'color') ?? null;
  return payload;
}

/** Sanitize a project list query DTO (the main process rebuilds the query string; server re-checks). */
function buildProjectListQuery(value: unknown): ProjectListQuery {
  if (value === undefined || value === null) return {};
  const o = asObject(value);
  const query: ProjectListQuery = {};
  const scope = optEnum<'active' | 'archived' | 'all'>(o['scope'], 'scope', [
    'active',
    'archived',
    'all',
  ]);
  if (scope !== undefined) query.scope = scope;
  const status = optEnum<ProjectStatus>(o['status'], 'status', PROJECT_STATUSES);
  if (status !== undefined) query.status = status;
  const search = optStr(o['search'], 'search');
  if (search !== undefined) query.search = search;
  const sort = optEnum<'createdAt' | 'updatedAt' | 'name'>(o['sort'], 'sort', [
    'createdAt',
    'updatedAt',
    'name',
  ]);
  if (sort !== undefined) query.sort = sort;
  const dir = optEnum<'asc' | 'desc'>(o['dir'], 'dir', ['asc', 'desc']);
  if (dir !== undefined) query.dir = dir;
  if (typeof o['limit'] === 'number') query.limit = o['limit'];
  const cursor = optStr(o['cursor'], 'cursor');
  if (cursor !== undefined) query.cursor = cursor;
  return query;
}

// ---- task input builders (Phase 5; every field validated at the trust boundary) ----

/**
 * Build a CreateTaskInput from a raw IPC object. Title is required; every optional field is coerced
 * through a strict guard. An assignee and each dependency id must be valid identifiers (they become
 * foreign keys the SERVER then re-validates against membership / project scope).
 */
function buildCreateTask(o: Record<string, unknown>): CreateTaskInput {
  const payload: CreateTaskInput = { title: reqStr(o['title'], 'title') };
  // A null description on CREATE simply means "none" — omit it (there is no prior value to clear).
  const description = optStr(o['description'], 'description');
  if (description !== undefined) payload.description = description;
  const status = optEnum<TaskStatus>(o['status'], 'status', TASK_STATUSES);
  if (status !== undefined) payload.status = status;
  const priority = optEnum<TaskPriority>(o['priority'], 'priority', TASK_PRIORITIES);
  if (priority !== undefined) payload.priority = priority;
  if (o['assigneeId'] !== undefined) {
    payload.assigneeId = o['assigneeId'] === null ? null : reqId(o['assigneeId'], 'assigneeId');
  }
  if ('startDate' in o) payload.startDate = optStrOrNull(o['startDate'], 'startDate') ?? null;
  if ('dueDate' in o) payload.dueDate = optStrOrNull(o['dueDate'], 'dueDate') ?? null;
  if (o['dependencyIds'] !== undefined) {
    payload.dependencyIds = reqIdArray(o['dependencyIds'], 'dependencyIds');
  }
  return payload;
}

/** Build an UpdateTaskInput (content patch); carries only present fields — the server rejects empties. */
function buildUpdateTask(o: Record<string, unknown>): UpdateTaskInput {
  const payload: UpdateTaskInput = {};
  const title = optStr(o['title'], 'title');
  if (title !== undefined) payload.title = title;
  if ('description' in o) {
    payload.description = optStrOrNull(o['description'], 'description') ?? null;
  }
  const status = optEnum<TaskStatus>(o['status'], 'status', TASK_STATUSES);
  if (status !== undefined) payload.status = status;
  const priority = optEnum<TaskPriority>(o['priority'], 'priority', TASK_PRIORITIES);
  if (priority !== undefined) payload.priority = priority;
  if ('startDate' in o) payload.startDate = optStrOrNull(o['startDate'], 'startDate') ?? null;
  if ('dueDate' in o) payload.dueDate = optStrOrNull(o['dueDate'], 'dueDate') ?? null;
  return payload;
}

/** Sanitize a task list query DTO (main process rebuilds the query string; server re-checks). */
function buildTaskListQuery(value: unknown): TaskListQuery {
  if (value === undefined || value === null) return {};
  const o = asObject(value);
  const query: TaskListQuery = {};
  const status = optEnum<TaskStatus>(o['status'], 'status', TASK_STATUSES);
  if (status !== undefined) query.status = status;
  const priority = optEnum<TaskPriority>(o['priority'], 'priority', TASK_PRIORITIES);
  if (priority !== undefined) query.priority = priority;
  if (typeof o['assigneeId'] === 'string' && o['assigneeId'].length > 0) {
    query.assigneeId = reqId(o['assigneeId'], 'assigneeId');
  }
  if (typeof o['unassigned'] === 'boolean') query.unassigned = o['unassigned'];
  const search = optStr(o['search'], 'search');
  if (search !== undefined) query.search = search;
  const sort = optEnum<TaskSortField>(o['sort'], 'sort', TASK_SORT_FIELDS);
  if (sort !== undefined) query.sort = sort;
  const dir = optEnum<'asc' | 'desc'>(o['dir'], 'dir', ['asc', 'desc']);
  if (dir !== undefined) query.dir = dir;
  if (typeof o['limit'] === 'number') query.limit = o['limit'];
  const cursor = optStr(o['cursor'], 'cursor');
  if (cursor !== undefined) query.cursor = cursor;
  return query;
}

/** Sanitize an activity query (limit + opaque cursor only). */
function buildActivityQuery(value: unknown): { limit?: number; cursor?: string } {
  if (value === undefined || value === null) return {};
  const o = asObject(value);
  const query: { limit?: number; cursor?: string } = {};
  if (typeof o['limit'] === 'number') query.limit = o['limit'];
  const cursor = optStr(o['cursor'], 'cursor');
  if (cursor !== undefined) query.cursor = cursor;
  return query;
}

// ---- decision input builders (Phase 6; every field validated at the trust boundary) ----

/** A non-empty array guard that keeps each item as a plain object for field-by-field validation. */
function objArray(value: unknown, field: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new ApiRequestError('INVALID_ARGUMENT', `${field} must be an array`);
  }
  return value.map((item) => asObject(item));
}

function reqBool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ApiRequestError('INVALID_ARGUMENT', `${field} must be a boolean`);
  }
  return value;
}

/**
 * Build the owned-alternatives set. REPLACE semantics are decided by the server; here we only shape
 * and bound the payload. At most one `chosen: true` is enforced SERVER-side (a client cannot bypass it).
 */
function buildAlternatives(value: unknown): DecisionAlternativeInput[] {
  return objArray(value, 'alternatives').map((o) => {
    const item: DecisionAlternativeInput = { label: reqStr(o['label'], 'alternatives[].label') };
    if ('description' in o) {
      item.description = optStrOrNull(o['description'], 'alternatives[].description') ?? null;
    }
    if ('chosen' in o) item.chosen = reqBool(o['chosen'], 'alternatives[].chosen');
    return item;
  });
}

/**
 * Build the cited-references set. `type` must come from the closed vocabulary; `url` / `entityId` are
 * carried as-is (shape rules per type — e.g. TASK needs an id, LINK needs a URL — are server-enforced).
 */
function buildReferences(value: unknown): DecisionReferenceInput[] {
  return objArray(value, 'references').map((o) => {
    const type = optEnum<DecisionReferenceType>(
      o['type'],
      'references[].type',
      DECISION_REFERENCE_TYPES,
    );
    if (!type) {
      throw new ApiRequestError('INVALID_ARGUMENT', 'references[].type is required');
    }
    const item: DecisionReferenceInput = { type, label: reqStr(o['label'], 'references[].label') };
    if ('url' in o) item.url = optStrOrNull(o['url'], 'references[].url') ?? null;
    if ('entityId' in o) {
      item.entityId = optStrOrNull(o['entityId'], 'references[].entityId') ?? null;
      if (item.entityId !== null) item.entityId = reqId(item.entityId, 'references[].entityId');
    }
    return item;
  });
}

/** Carry a context link only when it is a real id — an explicit null means "no link" on create. */
function contextLink(o: Record<string, unknown>, key: string): string | undefined {
  const value = o[key];
  if (value === undefined || value === null) return undefined;
  return reqId(value, key);
}

/** Build a CreateDecisionInput. Title is required; the server derives `source` from the context link. */
function buildCreateDecision(o: Record<string, unknown>): CreateDecisionInput {
  const payload: CreateDecisionInput = { title: reqStr(o['title'], 'title') };
  for (const field of ['background', 'decision', 'rationale', 'consequences'] as const) {
    const value = optStr(o[field], field);
    if (value !== undefined) payload[field] = value;
  }
  const status = optEnum<'DRAFT' | 'IN_DISCUSSION'>(o['status'], 'status', [
    'DRAFT',
    'IN_DISCUSSION',
  ]);
  if (status !== undefined) payload.status = status;
  const source = optEnum<'MANUAL' | 'MEETING'>(o['source'], 'source', ['MANUAL', 'MEETING']);
  if (source !== undefined) payload.source = source;
  const projectId = contextLink(o, 'projectId');
  if (projectId !== undefined) payload.projectId = projectId;
  const conversationId = contextLink(o, 'conversationId');
  if (conversationId !== undefined) payload.conversationId = conversationId;
  const taskId = contextLink(o, 'taskId');
  if (taskId !== undefined) payload.taskId = taskId;
  if (o['participantUserIds'] !== undefined) {
    payload.participantUserIds = reqIdArray(o['participantUserIds'], 'participantUserIds');
  }
  if (o['alternatives'] !== undefined) payload.alternatives = buildAlternatives(o['alternatives']);
  if (o['references'] !== undefined) payload.references = buildReferences(o['references']);
  return payload;
}

/** Build an UpdateDecisionInput (content patch); context links are immutable here by design. */
function buildUpdateDecision(o: Record<string, unknown>): UpdateDecisionInput {
  const payload: UpdateDecisionInput = {};
  const title = optStr(o['title'], 'title');
  if (title !== undefined) payload.title = title;
  for (const field of ['background', 'decision', 'rationale', 'consequences'] as const) {
    if (field in o) payload[field] = optStrOrNull(o[field], field) ?? null;
  }
  const status = optEnum<'DRAFT' | 'IN_DISCUSSION'>(o['status'], 'status', [
    'DRAFT',
    'IN_DISCUSSION',
  ]);
  if (status !== undefined) payload.status = status;
  if (o['alternatives'] !== undefined) payload.alternatives = buildAlternatives(o['alternatives']);
  if (o['references'] !== undefined) payload.references = buildReferences(o['references']);
  return payload;
}

/** Sanitize a decision list query DTO (main process rebuilds the query string; server re-checks). */
function buildDecisionListQuery(value: unknown): DecisionListQuery {
  if (value === undefined || value === null) return {};
  const o = asObject(value);
  const query: DecisionListQuery = {};
  const status = optEnum<DecisionStatus>(o['status'], 'status', DECISION_STATUSES);
  if (status !== undefined) query.status = status;
  const source = optEnum<DecisionSource>(o['source'], 'source', DECISION_SOURCES);
  if (source !== undefined) query.source = source;
  const projectId = contextLink(o, 'projectId');
  if (projectId !== undefined) query.projectId = projectId;
  const participantId = contextLink(o, 'participantId');
  if (participantId !== undefined) query.participantId = participantId;
  const search = optStr(o['search'], 'search');
  if (search !== undefined) query.search = search;
  const sort = optEnum<DecisionSortField>(o['sort'], 'sort', DECISION_SORT_FIELDS);
  if (sort !== undefined) query.sort = sort;
  const dir = optEnum<'asc' | 'desc'>(o['dir'], 'dir', ['asc', 'desc']);
  if (dir !== undefined) query.dir = dir;
  if (typeof o['limit'] === 'number') query.limit = o['limit'];
  const cursor = optStr(o['cursor'], 'cursor');
  if (cursor !== undefined) query.cursor = cursor;
  return query;
}

/** Build the one-field participant payload; the id is re-validated as a member by the server. */
function buildParticipantInput(o: Record<string, unknown>): DecisionParticipantInput {
  return { userId: reqId(o['userId'], 'userId') };
}

function toIpcError(error: unknown): IpcError {
  if (error instanceof ApiRequestError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }
  // Anything unexpected: log server-side, hand back a generic, non-leaky message.
  console.error(
    '[desktop] IPC handler error:',
    error instanceof Error ? error.message : String(error),
  );
  return { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' };
}

/** Run a privileged operation for a trusted sender, mapping the result into the safe envelope. */
async function handle<T>(event: IpcMainInvokeEvent, op: () => Promise<T>): Promise<IpcOutcome<T>> {
  try {
    assertTrustedSender(event);
    return { ok: true, data: await op() };
  } catch (error) {
    return { ok: false, error: toIpcError(error) };
  }
}

/**
 * The role a renderer may request via `members.updateRole`. The bridge intentionally cannot assign
 * OWNER (only a transfer does), so an OWNER here is rejected at the boundary as a defense-in-depth
 * mirror of the server rule — the server remains the authority regardless.
 */
function assignableRole(value: unknown): WorkspaceRole {
  const role = reqRole(value);
  if (ROLE_RANK[role] >= ROLE_RANK.OWNER) {
    throw new ApiRequestError('INVALID_ARGUMENT', 'Ownership is transferred, not assigned');
  }
  return role;
}

export function registerIpc(): void {
  // ---- app / window ----
  ipcMain.handle(IPC.GET_CONFIG, (event) => handle(event, async () => resolveDesktopConfig()));

  ipcMain.handle(IPC.GET_PLATFORM_INFO, (event) =>
    handle(event, async () => ({ platform: process.platform, arch: process.arch })),
  );

  ipcMain.handle(IPC.OPEN_EXTERNAL, (event, url: unknown) =>
    handle(event, async () => {
      if (typeof url !== 'string') return { ok: false, reason: 'url must be a string' };
      return routeExternalUrl(url);
    }),
  );

  ipcMain.handle(IPC.WINDOW_MINIMIZE, (event) =>
    handle(event, async () => {
      windowOf(event)?.minimize();
    }),
  );

  ipcMain.handle(IPC.WINDOW_TOGGLE_MAXIMIZE, (event) =>
    handle(event, async () => {
      const win = windowOf(event);
      if (!win) return;
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }),
  );

  ipcMain.handle(IPC.WINDOW_CLOSE, (event) =>
    handle(event, async () => {
      windowOf(event)?.close();
    }),
  );

  // ---- auth ----
  ipcMain.handle(IPC.AUTH_REGISTER, (event, input: unknown) =>
    handle(event, async () => {
      const o = asObject(input);
      const payload: RegisterInput = {
        name: reqStr(o['name'], 'name'),
        email: reqStr(o['email'], 'email'),
        password: reqStr(o['password'], 'password'),
      };
      return api.auth.register(payload);
    }),
  );

  ipcMain.handle(IPC.AUTH_LOGIN, (event, input: unknown) =>
    handle(event, async () => {
      const o = asObject(input);
      const payload: LoginInput = {
        email: reqStr(o['email'], 'email'),
        password: reqStr(o['password'], 'password'),
      };
      return api.auth.login(payload);
    }),
  );

  ipcMain.handle(IPC.AUTH_LOGOUT, (event) => handle(event, () => api.auth.logout()));
  ipcMain.handle(IPC.AUTH_ME, (event) => handle(event, () => api.auth.me()));

  ipcMain.handle(IPC.AUTH_CHANGE_PASSWORD, (event, input: unknown) =>
    handle(event, async () => {
      const o = asObject(input);
      const payload: ChangePasswordInput = {
        currentPassword: reqStr(o['currentPassword'], 'currentPassword'),
        newPassword: reqStr(o['newPassword'], 'newPassword'),
      };
      return api.auth.changePassword(payload);
    }),
  );

  // ---- users ----
  ipcMain.handle(IPC.USERS_UPDATE_ME, (event, input: unknown) =>
    handle(event, async () => {
      const o = asObject(input);
      const payload: UpdateProfileInput = {};
      const name = optStr(o['name'], 'name');
      if (name !== undefined) payload.name = name;
      if ('avatarUrl' in o) {
        const avatar = o['avatarUrl'];
        if (avatar !== null && typeof avatar !== 'string') {
          throw new ApiRequestError('INVALID_ARGUMENT', 'avatarUrl must be a string or null');
        }
        payload.avatarUrl = avatar as string | null;
      }
      return api.users.updateMe(payload);
    }),
  );

  // ---- workspaces ----
  ipcMain.handle(IPC.WORKSPACES_LIST, (event) => handle(event, () => api.workspaces.list()));

  ipcMain.handle(IPC.WORKSPACES_CREATE, (event, input: unknown) =>
    handle(event, async () => {
      const o = asObject(input);
      const payload: CreateWorkspaceInput = { name: reqStr(o['name'], 'name') };
      const description = optStr(o['description'], 'description');
      if (description !== undefined) payload.description = description;
      if ('iconUrl' in o) {
        const icon = o['iconUrl'];
        if (icon !== null && typeof icon !== 'string') {
          throw new ApiRequestError('INVALID_ARGUMENT', 'iconUrl must be a string or null');
        }
        payload.iconUrl = icon as string | null;
      }
      return api.workspaces.create(payload);
    }),
  );

  ipcMain.handle(IPC.WORKSPACES_GET, (event, workspaceId: unknown) =>
    handle(event, () => api.workspaces.get(reqStr(workspaceId, 'workspaceId'))),
  );

  ipcMain.handle(IPC.WORKSPACES_UPDATE, (event, workspaceId: unknown, input: unknown) =>
    handle(event, async () => {
      const id = reqStr(workspaceId, 'workspaceId');
      const o = asObject(input);
      const payload: UpdateWorkspaceInput = {};
      const name = optStr(o['name'], 'name');
      if (name !== undefined) payload.name = name;
      if ('description' in o) {
        const desc = o['description'];
        if (desc !== null && typeof desc !== 'string') {
          throw new ApiRequestError('INVALID_ARGUMENT', 'description must be a string or null');
        }
        payload.description = desc as string | null;
      }
      if ('iconUrl' in o) {
        const icon = o['iconUrl'];
        if (icon !== null && typeof icon !== 'string') {
          throw new ApiRequestError('INVALID_ARGUMENT', 'iconUrl must be a string or null');
        }
        payload.iconUrl = icon as string | null;
      }
      return api.workspaces.update(id, payload);
    }),
  );

  // ---- members ----
  ipcMain.handle(IPC.MEMBERS_LIST, (event, workspaceId: unknown) =>
    handle(event, () => api.members.list(reqStr(workspaceId, 'workspaceId'))),
  );

  ipcMain.handle(
    IPC.MEMBERS_UPDATE_ROLE,
    (event, workspaceId: unknown, memberId: unknown, role: unknown) =>
      handle(event, () =>
        api.members.updateRole(
          reqStr(workspaceId, 'workspaceId'),
          reqStr(memberId, 'memberId'),
          assignableRole(role),
        ),
      ),
  );

  ipcMain.handle(IPC.MEMBERS_REMOVE, (event, workspaceId: unknown, memberId: unknown) =>
    handle(event, () =>
      api.members.remove(reqStr(workspaceId, 'workspaceId'), reqStr(memberId, 'memberId')),
    ),
  );

  ipcMain.handle(IPC.MEMBERS_TRANSFER, (event, workspaceId: unknown, memberId: unknown) =>
    handle(event, () =>
      api.members.transfer(reqStr(workspaceId, 'workspaceId'), reqStr(memberId, 'memberId')),
    ),
  );

  // ---- invitations ----
  ipcMain.handle(IPC.INVITATIONS_CREATE, (event, workspaceId: unknown, input: unknown) =>
    handle(event, async () => {
      const id = reqStr(workspaceId, 'workspaceId');
      const o = asObject(input);
      const payload: CreateInvitationInput = {
        email: reqStr(o['email'], 'email'),
        role: reqRole(o['role']),
      };
      return api.invitations.create(id, payload);
    }),
  );

  ipcMain.handle(IPC.INVITATIONS_LIST, (event, workspaceId: unknown) =>
    handle(event, () => api.invitations.list(reqStr(workspaceId, 'workspaceId'))),
  );

  ipcMain.handle(IPC.INVITATIONS_REVOKE, (event, workspaceId: unknown, invitationId: unknown) =>
    handle(event, () =>
      api.invitations.revoke(
        reqStr(workspaceId, 'workspaceId'),
        reqStr(invitationId, 'invitationId'),
      ),
    ),
  );

  ipcMain.handle(IPC.INVITATIONS_ACCEPT, (event, input: unknown) =>
    handle(event, async () => {
      const o = asObject(input);
      const payload: AcceptInvitationInput = { token: reqStr(o['token'], 'token') };
      return api.invitations.accept(payload);
    }),
  );

  ipcMain.handle(IPC.INVITATIONS_PENDING_FOR_ME, (event) =>
    handle(event, () => api.invitations.pendingForMe()),
  );

  // ---- chat (Phase 3, app-level; ids strictly validated because they are interpolated into paths) ----
  ipcMain.handle(IPC.CHAT_GET_TOKEN, (event, workspaceId: unknown) =>
    handle(event, () => api.chat.getToken(reqId(workspaceId, 'workspaceId'))),
  );

  ipcMain.handle(IPC.CHAT_LIST_CONVERSATIONS, (event, workspaceId: unknown) =>
    handle(event, () => api.chat.listConversations(reqId(workspaceId, 'workspaceId'))),
  );

  ipcMain.handle(IPC.CHAT_CREATE_CONVERSATION, (event, workspaceId: unknown, input: unknown) =>
    handle(event, async () => {
      const id = reqId(workspaceId, 'workspaceId');
      const o = asObject(input);
      const payload: CreateConversationInput = {
        kind: reqKind(o['kind']),
        participantUserIds: reqIdArray(o['participantUserIds'], 'participantUserIds'),
      };
      const title = optStr(o['title'], 'title');
      if (title !== undefined) payload.title = title;
      return api.chat.createConversation(id, payload);
    }),
  );

  ipcMain.handle(
    IPC.CHAT_GET_CONVERSATION,
    (event, workspaceId: unknown, conversationId: unknown) =>
      handle(event, () =>
        api.chat.getConversation(
          reqId(workspaceId, 'workspaceId'),
          reqId(conversationId, 'conversationId'),
        ),
      ),
  );

  ipcMain.handle(
    IPC.CHAT_ADD_MEMBERS,
    (event, workspaceId: unknown, conversationId: unknown, userIds: unknown) =>
      handle(event, () =>
        api.chat.addMembers(
          reqId(workspaceId, 'workspaceId'),
          reqId(conversationId, 'conversationId'),
          reqIdArray(userIds, 'userIds'),
        ),
      ),
  );

  ipcMain.handle(
    IPC.CHAT_REMOVE_MEMBER,
    (event, workspaceId: unknown, conversationId: unknown, userId: unknown) =>
      handle(event, () =>
        api.chat.removeMember(
          reqId(workspaceId, 'workspaceId'),
          reqId(conversationId, 'conversationId'),
          reqId(userId, 'userId'),
        ),
      ),
  );

  // ---- projects (Phase 4; ids interpolated into paths, so strictly validated) ----
  ipcMain.handle(IPC.PROJECTS_LIST, (event, workspaceId: unknown, query: unknown) =>
    handle(event, () =>
      api.projects.list(reqId(workspaceId, 'workspaceId'), buildProjectListQuery(query)),
    ),
  );

  ipcMain.handle(IPC.PROJECTS_CREATE, (event, workspaceId: unknown, input: unknown) =>
    handle(event, () =>
      api.projects.create(reqId(workspaceId, 'workspaceId'), buildCreateProject(asObject(input))),
    ),
  );

  ipcMain.handle(IPC.PROJECTS_GET_OVERVIEW, (event, workspaceId: unknown, projectId: unknown) =>
    handle(event, () =>
      api.projects.getOverview(reqId(workspaceId, 'workspaceId'), reqId(projectId, 'projectId')),
    ),
  );

  ipcMain.handle(
    IPC.PROJECTS_UPDATE,
    (event, workspaceId: unknown, projectId: unknown, input: unknown) =>
      handle(event, () =>
        api.projects.update(
          reqId(workspaceId, 'workspaceId'),
          reqId(projectId, 'projectId'),
          buildUpdateProject(asObject(input)),
        ),
      ),
  );

  ipcMain.handle(IPC.PROJECTS_ARCHIVE, (event, workspaceId: unknown, projectId: unknown) =>
    handle(event, () =>
      api.projects.archive(reqId(workspaceId, 'workspaceId'), reqId(projectId, 'projectId')),
    ),
  );

  ipcMain.handle(IPC.PROJECTS_RESTORE, (event, workspaceId: unknown, projectId: unknown) =>
    handle(event, () =>
      api.projects.restore(reqId(workspaceId, 'workspaceId'), reqId(projectId, 'projectId')),
    ),
  );

  // ---- tasks (Phase 5; ids interpolated into paths, so strictly validated; inputs via builders) ----
  ipcMain.handle(
    IPC.TASKS_LIST,
    (event, workspaceId: unknown, projectId: unknown, query: unknown) =>
      handle(event, () =>
        api.tasks.list(
          reqId(workspaceId, 'workspaceId'),
          reqId(projectId, 'projectId'),
          buildTaskListQuery(query),
        ),
      ),
  );

  ipcMain.handle(
    IPC.TASKS_CREATE,
    (event, workspaceId: unknown, projectId: unknown, input: unknown) =>
      handle(event, () =>
        api.tasks.create(
          reqId(workspaceId, 'workspaceId'),
          reqId(projectId, 'projectId'),
          buildCreateTask(asObject(input)),
        ),
      ),
  );

  ipcMain.handle(IPC.TASKS_GET, (event, workspaceId: unknown, taskId: unknown) =>
    handle(event, () => api.tasks.get(reqId(workspaceId, 'workspaceId'), reqId(taskId, 'taskId'))),
  );

  ipcMain.handle(IPC.TASKS_UPDATE, (event, workspaceId: unknown, taskId: unknown, input: unknown) =>
    handle(event, () =>
      api.tasks.update(
        reqId(workspaceId, 'workspaceId'),
        reqId(taskId, 'taskId'),
        buildUpdateTask(asObject(input)),
      ),
    ),
  );

  ipcMain.handle(IPC.TASKS_REMOVE, (event, workspaceId: unknown, taskId: unknown) =>
    handle(event, () =>
      api.tasks.remove(reqId(workspaceId, 'workspaceId'), reqId(taskId, 'taskId')),
    ),
  );

  ipcMain.handle(IPC.TASKS_ASSIGN, (event, workspaceId: unknown, taskId: unknown, input: unknown) =>
    handle(event, () => {
      const o = asObject(input);
      if (o['assigneeId'] === undefined) {
        throw new ApiRequestError('INVALID_ARGUMENT', 'assigneeId is required (may be null)');
      }
      const payload: AssignTaskInput = {
        assigneeId: o['assigneeId'] === null ? null : reqId(o['assigneeId'], 'assigneeId'),
      };
      return api.tasks.assign(reqId(workspaceId, 'workspaceId'), reqId(taskId, 'taskId'), payload);
    }),
  );

  ipcMain.handle(
    IPC.TASKS_CHANGE_STATUS,
    (event, workspaceId: unknown, taskId: unknown, input: unknown) =>
      handle(event, () => {
        const o = asObject(input);
        const payload: ChangeTaskStatusInput = {
          status: optEnum<TaskStatus>(o['status'], 'status', TASK_STATUSES) as TaskStatus,
        };
        if (!payload.status) {
          throw new ApiRequestError('INVALID_ARGUMENT', 'status is required');
        }
        return api.tasks.changeStatus(
          reqId(workspaceId, 'workspaceId'),
          reqId(taskId, 'taskId'),
          payload,
        );
      }),
  );

  ipcMain.handle(IPC.TASKS_DEPENDENCIES, (event, workspaceId: unknown, taskId: unknown) =>
    handle(event, () =>
      api.tasks.dependencies(reqId(workspaceId, 'workspaceId'), reqId(taskId, 'taskId')),
    ),
  );

  ipcMain.handle(
    IPC.TASKS_ADD_DEPENDENCY,
    (event, workspaceId: unknown, taskId: unknown, input: unknown) =>
      handle(event, () => {
        const o = asObject(input);
        const payload: AddTaskDependencyInput = {
          dependsOnTaskId: reqId(o['dependsOnTaskId'], 'dependsOnTaskId'),
        };
        return api.tasks.addDependency(
          reqId(workspaceId, 'workspaceId'),
          reqId(taskId, 'taskId'),
          payload,
        );
      }),
  );

  ipcMain.handle(
    IPC.TASKS_REMOVE_DEPENDENCY,
    (event, workspaceId: unknown, taskId: unknown, dependencyId: unknown) =>
      handle(event, () =>
        api.tasks.removeDependency(
          reqId(workspaceId, 'workspaceId'),
          reqId(taskId, 'taskId'),
          reqId(dependencyId, 'dependencyId'),
        ),
      ),
  );

  ipcMain.handle(
    IPC.TASKS_ACTIVITY,
    (event, workspaceId: unknown, taskId: unknown, query: unknown) =>
      handle(event, () =>
        api.tasks.activity(
          reqId(workspaceId, 'workspaceId'),
          reqId(taskId, 'taskId'),
          buildActivityQuery(query),
        ),
      ),
  );

  ipcMain.handle(IPC.TASKS_ASSIGNED_TO_ME, (event, workspaceId: unknown) =>
    handle(event, () => api.tasks.assignedToMe(reqId(workspaceId, 'workspaceId'))),
  );

  // ---- decisions (Phase 6; ids interpolated into paths, so strictly validated; inputs via builders) ----
  ipcMain.handle(IPC.DECISIONS_LIST, (event, workspaceId: unknown, query: unknown) =>
    handle(event, () =>
      api.decisions.list(reqId(workspaceId, 'workspaceId'), buildDecisionListQuery(query)),
    ),
  );

  ipcMain.handle(IPC.DECISIONS_CREATE, (event, workspaceId: unknown, input: unknown) =>
    handle(event, () =>
      api.decisions.create(
        reqId(workspaceId, 'workspaceId'),
        buildCreateDecision(asObject(input)),
      ),
    ),
  );

  ipcMain.handle(IPC.DECISIONS_GET, (event, workspaceId: unknown, decisionId: unknown) =>
    handle(event, () =>
      api.decisions.get(reqId(workspaceId, 'workspaceId'), reqId(decisionId, 'decisionId')),
    ),
  );

  ipcMain.handle(
    IPC.DECISIONS_UPDATE,
    (event, workspaceId: unknown, decisionId: unknown, input: unknown) =>
      handle(event, () =>
        api.decisions.update(
          reqId(workspaceId, 'workspaceId'),
          reqId(decisionId, 'decisionId'),
          buildUpdateDecision(asObject(input)),
        ),
      ),
  );

  ipcMain.handle(IPC.DECISIONS_REMOVE, (event, workspaceId: unknown, decisionId: unknown) =>
    handle(event, () =>
      api.decisions.remove(reqId(workspaceId, 'workspaceId'), reqId(decisionId, 'decisionId')),
    ),
  );

  ipcMain.handle(IPC.DECISIONS_FINALIZE, (event, workspaceId: unknown, decisionId: unknown) =>
    handle(event, () =>
      api.decisions.finalize(reqId(workspaceId, 'workspaceId'), reqId(decisionId, 'decisionId')),
    ),
  );

  ipcMain.handle(
    IPC.DECISIONS_SUPERSEDE,
    (event, workspaceId: unknown, decisionId: unknown, input: unknown) =>
      handle(event, () => {
        const o = asObject(input);
        const payload: SupersedeDecisionInput = {
          byDecisionId: reqId(o['byDecisionId'], 'byDecisionId'),
        };
        return api.decisions.supersede(
          reqId(workspaceId, 'workspaceId'),
          reqId(decisionId, 'decisionId'),
          payload,
        );
      }),
  );

  ipcMain.handle(IPC.DECISIONS_ARCHIVE, (event, workspaceId: unknown, decisionId: unknown) =>
    handle(event, () =>
      api.decisions.archive(reqId(workspaceId, 'workspaceId'), reqId(decisionId, 'decisionId')),
    ),
  );

  ipcMain.handle(IPC.DECISIONS_RESTORE, (event, workspaceId: unknown, decisionId: unknown) =>
    handle(event, () =>
      api.decisions.restore(reqId(workspaceId, 'workspaceId'), reqId(decisionId, 'decisionId')),
    ),
  );

  ipcMain.handle(
    IPC.DECISIONS_ADD_PARTICIPANT,
    (event, workspaceId: unknown, decisionId: unknown, input: unknown) =>
      handle(event, () =>
        api.decisions.addParticipant(
          reqId(workspaceId, 'workspaceId'),
          reqId(decisionId, 'decisionId'),
          buildParticipantInput(asObject(input)),
        ),
      ),
  );

  ipcMain.handle(
    IPC.DECISIONS_REMOVE_PARTICIPANT,
    (event, workspaceId: unknown, decisionId: unknown, userId: unknown) =>
      handle(event, () =>
        api.decisions.removeParticipant(
          reqId(workspaceId, 'workspaceId'),
          reqId(decisionId, 'decisionId'),
          reqId(userId, 'userId'),
        ),
      ),
  );

  ipcMain.handle(
    IPC.DECISIONS_HISTORY,
    (event, workspaceId: unknown, decisionId: unknown, query: unknown) =>
      handle(event, () =>
        api.decisions.history(
          reqId(workspaceId, 'workspaceId'),
          reqId(decisionId, 'decisionId'),
          buildActivityQuery(query),
        ),
      ),
  );

  ipcMain.handle(
    IPC.DECISIONS_LIST_COMMENTS,
    (event, workspaceId: unknown, decisionId: unknown, query: unknown) =>
      handle(event, () =>
        api.decisions.listComments(
          reqId(workspaceId, 'workspaceId'),
          reqId(decisionId, 'decisionId'),
          buildActivityQuery(query),
        ),
      ),
  );

  ipcMain.handle(
    IPC.DECISIONS_ADD_COMMENT,
    (event, workspaceId: unknown, decisionId: unknown, input: unknown) =>
      handle(event, () => {
        const o = asObject(input);
        const payload: CreateDecisionCommentInput = { body: reqStr(o['body'], 'body') };
        return api.decisions.addComment(
          reqId(workspaceId, 'workspaceId'),
          reqId(decisionId, 'decisionId'),
          payload,
        );
      }),
  );

  ipcMain.handle(
    IPC.DECISIONS_DELETE_COMMENT,
    (event, workspaceId: unknown, decisionId: unknown, commentId: unknown) =>
      handle(event, () =>
        api.decisions.deleteComment(
          reqId(workspaceId, 'workspaceId'),
          reqId(decisionId, 'decisionId'),
          reqId(commentId, 'commentId'),
        ),
      ),
  );
}
