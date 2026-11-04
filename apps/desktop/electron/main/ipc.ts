import { BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import type {
  AcceptInvitationInput,
  ChangePasswordInput,
  ConversationKind,
  CreateConversationInput,
  CreateInvitationInput,
  CreateWorkspaceInput,
  IpcError,
  IpcOutcome,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
  UpdateWorkspaceInput,
  WorkspaceRole,
} from '@buildtogether/shared';
import { IPC, ROLE_RANK } from '@buildtogether/shared';
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
}
