/**
 * Desktop (Electron) contracts shared between the main process, the typed preload
 * bridge, and the renderer. Kept in `@buildtogether/shared` so both sides of the IPC
 * boundary compile against the same types (frontend-engineering + security-review rules).
 *
 * SECURITY: these types describe only the *minimal, allowlisted* surface exposed to the
 * renderer. Raw `ipcRenderer` / Node APIs are never exposed. No secrets cross this boundary.
 */

/** Non-secret runtime configuration the main process resolves and hands to the renderer. */
export interface DesktopConfig {
  /** Base URL of the remote BuildTogether API. Environment-aware; never a hardcoded prod localhost. */
  apiBaseUrl: string;
  /** Application version (from package metadata). */
  appVersion: string;
  /** Host platform reported by Electron (`process.platform`). */
  platform: string;
}

/** The API surface the preload bridge exposes on `window.bt`. */
export interface DesktopBridge {
  /** Fetch resolved, non-secret runtime configuration. */
  getConfig(): Promise<DesktopConfig>;
  /** Health/ping to prove the renderer -> main IPC path works. */
  getPlatformInfo(): Promise<{ platform: string; arch: string }>;
  /** Open an https URL in the OS default browser. Main validates the URL. */
  openExternal(url: string): Promise<{ ok: boolean; reason?: string }>;
  /** Native window controls (no-ops where not applicable). */
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
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
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
