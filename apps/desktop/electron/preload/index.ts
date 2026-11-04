import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '@buildtogether/shared';
import { IPC } from '@buildtogether/shared';

/**
 * Sandboxed, typed preload bridge. Exposes a minimal, NAMED surface on `window.bt` — never raw
 * `ipcRenderer`, never Node APIs, and never authentication tokens (ADR-0003 §11). Each method maps
 * to exactly one allowlisted IPC channel; the trusted main process attaches the session token,
 * authorizes against the server, and returns only sanitized views. (Electron security #17 / #20.)
 */
function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

const bridge: DesktopBridge = {
  getConfig: () => invoke(IPC.GET_CONFIG),

  getPlatformInfo: () => invoke(IPC.GET_PLATFORM_INFO),

  openExternal: (url) => invoke(IPC.OPEN_EXTERNAL, url),

  window: {
    minimize: () => invoke(IPC.WINDOW_MINIMIZE),
    toggleMaximize: () => invoke(IPC.WINDOW_TOGGLE_MAXIMIZE),
    close: () => invoke(IPC.WINDOW_CLOSE),
  },

  auth: {
    register: (input) => invoke(IPC.AUTH_REGISTER, input),
    login: (input) => invoke(IPC.AUTH_LOGIN, input),
    logout: () => invoke(IPC.AUTH_LOGOUT),
    me: () => invoke(IPC.AUTH_ME),
    changePassword: (input) => invoke(IPC.AUTH_CHANGE_PASSWORD, input),
  },

  users: {
    updateMe: (input) => invoke(IPC.USERS_UPDATE_ME, input),
  },

  workspaces: {
    list: () => invoke(IPC.WORKSPACES_LIST),
    create: (input) => invoke(IPC.WORKSPACES_CREATE, input),
    get: (workspaceId) => invoke(IPC.WORKSPACES_GET, workspaceId),
    update: (workspaceId, input) => invoke(IPC.WORKSPACES_UPDATE, workspaceId, input),
  },

  members: {
    list: (workspaceId) => invoke(IPC.MEMBERS_LIST, workspaceId),
    updateRole: (workspaceId, memberId, role) =>
      invoke(IPC.MEMBERS_UPDATE_ROLE, workspaceId, memberId, role),
    remove: (workspaceId, memberId) => invoke(IPC.MEMBERS_REMOVE, workspaceId, memberId),
    transfer: (workspaceId, memberId) => invoke(IPC.MEMBERS_TRANSFER, workspaceId, memberId),
  },

  invitations: {
    create: (workspaceId, input) => invoke(IPC.INVITATIONS_CREATE, workspaceId, input),
    list: (workspaceId) => invoke(IPC.INVITATIONS_LIST, workspaceId),
    revoke: (workspaceId, invitationId) =>
      invoke(IPC.INVITATIONS_REVOKE, workspaceId, invitationId),
    accept: (input) => invoke(IPC.INVITATIONS_ACCEPT, input),
    pendingForMe: () => invoke(IPC.INVITATIONS_PENDING_FOR_ME),
  },

  chat: {
    getToken: (workspaceId) => invoke(IPC.CHAT_GET_TOKEN, workspaceId),
    listConversations: (workspaceId) => invoke(IPC.CHAT_LIST_CONVERSATIONS, workspaceId),
    createConversation: (workspaceId, input) =>
      invoke(IPC.CHAT_CREATE_CONVERSATION, workspaceId, input),
    getConversation: (workspaceId, conversationId) =>
      invoke(IPC.CHAT_GET_CONVERSATION, workspaceId, conversationId),
    addMembers: (workspaceId, conversationId, userIds) =>
      invoke(IPC.CHAT_ADD_MEMBERS, workspaceId, conversationId, userIds),
    removeMember: (workspaceId, conversationId, userId) =>
      invoke(IPC.CHAT_REMOVE_MEMBER, workspaceId, conversationId, userId),
  },
};

contextBridge.exposeInMainWorld('bt', bridge);
