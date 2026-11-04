/**
 * Desktop (Electron) contracts shared between the main process, the typed preload bridge,
 * and the renderer. Kept in `@buildtogether/shared` so both sides of the IPC boundary
 * compile against the same types (frontend-engineering + security-review rules).
 *
 * SECURITY: this describes only the *minimal, allowlisted* surface exposed to the renderer.
 * Raw `ipcRenderer` / Node APIs are never exposed. **Authentication tokens NEVER cross into
 * the renderer** — the renderer requests named operations and the trusted main process
 * attaches/detaches the session token when it talks to the API (see ADR-0003).
 */

import type {
  AcceptInvitationInput,
  AuthSessionView,
  ChangePasswordInput,
  CreateInvitationInput,
  CreateWorkspaceInput,
  CreatedInvitation,
  InvitationSummary,
  LoginInput,
  MemberSummary,
  PublicUser,
  RegisterInput,
  UpdateProfileInput,
  UpdateWorkspaceInput,
  WorkspaceRole,
  WorkspaceSummary,
} from './domain';

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
  auth: {
    register(input: RegisterInput): Promise<IpcOutcome<AuthSessionView>>;
    login(input: LoginInput): Promise<IpcOutcome<AuthSessionView>>;
    logout(): Promise<IpcOutcome<null>>;
    /** Current session view, or data null when the main process holds no valid session. */
    me(): Promise<IpcOutcome<AuthSessionView | null>>;
    changePassword(input: ChangePasswordInput): Promise<IpcOutcome<null>>;
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
}

/** IPC channel names. Single source of truth so main and preload cannot drift. */
export const IPC = {
  GET_CONFIG: 'app:get-config',
  GET_PLATFORM_INFO: 'app:get-platform-info',
  OPEN_EXTERNAL: 'app:open-external',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  WINDOW_CLOSE: 'window:close',
  // Auth
  AUTH_REGISTER: 'auth:register',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_ME: 'auth:me',
  AUTH_CHANGE_PASSWORD: 'auth:change-password',
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
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
