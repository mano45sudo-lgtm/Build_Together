import { contextBridge, ipcRenderer } from 'electron';
import { exposeClerkBridge } from '@clerk/electron/preload';
import type { DesktopBridge } from '@buildtogether/shared';
import { IPC } from '@buildtogether/shared';

/**
 * Sandboxed, typed preload bridge. Exposes a minimal, NAMED surface on `window.bt` — never raw
 * `ipcRenderer`, never Node APIs, and never long-lived credentials (ADR-0003 §11; ADR-0006). Each
 * method maps to exactly one allowlisted IPC channel; the trusted main process authorizes against the
 * server and returns only sanitized views. (Electron security #17 / #20.)
 *
 * Clerk owns authentication: `exposeClerkBridge()` installs the official `@clerk/electron` IPC bridge
 * the renderer's `@clerk/electron/react` provider talks to (sign up/in, verification, token refresh).
 * Our own `auth` surface only relays the resulting SHORT-LIVED session JWT to main (`syncToken`) and
 * reads the sanitized `me` view — no credential/refresh endpoints remain.
 */
exposeClerkBridge();

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
    toggleFullScreen: () => invoke(IPC.WINDOW_TOGGLE_FULLSCREEN),
    getState: () => invoke(IPC.WINDOW_GET_STATE),
    onStateChanged: (listener) => {
      const onStateChanged = (_event: Electron.IpcRendererEvent, value: unknown) => {
        if (
          typeof value === 'object' &&
          value !== null &&
          'isMaximized' in value &&
          typeof value.isMaximized === 'boolean' &&
          'isFullScreen' in value &&
          typeof value.isFullScreen === 'boolean'
        ) {
          listener({ isMaximized: value.isMaximized, isFullScreen: value.isFullScreen });
        }
      };
      ipcRenderer.on(IPC.WINDOW_STATE_CHANGED, onStateChanged);
      return () => ipcRenderer.removeListener(IPC.WINDOW_STATE_CHANGED, onStateChanged);
    },
    close: () => invoke(IPC.WINDOW_CLOSE),
  },

  auth: {
    syncToken: (token) => invoke(IPC.AUTH_SYNC_TOKEN, token),
    me: () => invoke(IPC.AUTH_ME),
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

  projects: {
    list: (workspaceId, query) => invoke(IPC.PROJECTS_LIST, workspaceId, query),
    create: (workspaceId, input) => invoke(IPC.PROJECTS_CREATE, workspaceId, input),
    getOverview: (workspaceId, projectId) =>
      invoke(IPC.PROJECTS_GET_OVERVIEW, workspaceId, projectId),
    update: (workspaceId, projectId, input) =>
      invoke(IPC.PROJECTS_UPDATE, workspaceId, projectId, input),
    archive: (workspaceId, projectId) => invoke(IPC.PROJECTS_ARCHIVE, workspaceId, projectId),
    restore: (workspaceId, projectId) => invoke(IPC.PROJECTS_RESTORE, workspaceId, projectId),
  },

  tasks: {
    list: (workspaceId, projectId, query) => invoke(IPC.TASKS_LIST, workspaceId, projectId, query),
    create: (workspaceId, projectId, input) =>
      invoke(IPC.TASKS_CREATE, workspaceId, projectId, input),
    get: (workspaceId, taskId) => invoke(IPC.TASKS_GET, workspaceId, taskId),
    update: (workspaceId, taskId, input) => invoke(IPC.TASKS_UPDATE, workspaceId, taskId, input),
    remove: (workspaceId, taskId) => invoke(IPC.TASKS_REMOVE, workspaceId, taskId),
    assign: (workspaceId, taskId, input) => invoke(IPC.TASKS_ASSIGN, workspaceId, taskId, input),
    changeStatus: (workspaceId, taskId, input) =>
      invoke(IPC.TASKS_CHANGE_STATUS, workspaceId, taskId, input),
    dependencies: (workspaceId, taskId) => invoke(IPC.TASKS_DEPENDENCIES, workspaceId, taskId),
    addDependency: (workspaceId, taskId, input) =>
      invoke(IPC.TASKS_ADD_DEPENDENCY, workspaceId, taskId, input),
    removeDependency: (workspaceId, taskId, dependencyId) =>
      invoke(IPC.TASKS_REMOVE_DEPENDENCY, workspaceId, taskId, dependencyId),
    activity: (workspaceId, taskId, query) =>
      invoke(IPC.TASKS_ACTIVITY, workspaceId, taskId, query),
    assignedToMe: (workspaceId) => invoke(IPC.TASKS_ASSIGNED_TO_ME, workspaceId),
  },

  decisions: {
    list: (workspaceId, query) => invoke(IPC.DECISIONS_LIST, workspaceId, query),
    create: (workspaceId, input) => invoke(IPC.DECISIONS_CREATE, workspaceId, input),
    get: (workspaceId, decisionId) => invoke(IPC.DECISIONS_GET, workspaceId, decisionId),
    update: (workspaceId, decisionId, input) =>
      invoke(IPC.DECISIONS_UPDATE, workspaceId, decisionId, input),
    remove: (workspaceId, decisionId) => invoke(IPC.DECISIONS_REMOVE, workspaceId, decisionId),
    approve: (workspaceId, decisionId) => invoke(IPC.DECISIONS_APPROVE, workspaceId, decisionId),
    reject: (workspaceId, decisionId) => invoke(IPC.DECISIONS_REJECT, workspaceId, decisionId),
    supersede: (workspaceId, decisionId, input) =>
      invoke(IPC.DECISIONS_SUPERSEDE, workspaceId, decisionId, input),
    archive: (workspaceId, decisionId) => invoke(IPC.DECISIONS_ARCHIVE, workspaceId, decisionId),
    restore: (workspaceId, decisionId) => invoke(IPC.DECISIONS_RESTORE, workspaceId, decisionId),
    addParticipant: (workspaceId, decisionId, input) =>
      invoke(IPC.DECISIONS_ADD_PARTICIPANT, workspaceId, decisionId, input),
    removeParticipant: (workspaceId, decisionId, userId) =>
      invoke(IPC.DECISIONS_REMOVE_PARTICIPANT, workspaceId, decisionId, userId),
    history: (workspaceId, decisionId, query) =>
      invoke(IPC.DECISIONS_HISTORY, workspaceId, decisionId, query),
    listComments: (workspaceId, decisionId, query) =>
      invoke(IPC.DECISIONS_LIST_COMMENTS, workspaceId, decisionId, query),
    addComment: (workspaceId, decisionId, input) =>
      invoke(IPC.DECISIONS_ADD_COMMENT, workspaceId, decisionId, input),
    deleteComment: (workspaceId, decisionId, commentId) =>
      invoke(IPC.DECISIONS_DELETE_COMMENT, workspaceId, decisionId, commentId),
  },
};

contextBridge.exposeInMainWorld('bt', bridge);
