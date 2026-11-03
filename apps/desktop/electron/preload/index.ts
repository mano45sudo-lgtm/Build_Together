import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@buildtogether/shared';
import type { DesktopBridge, DesktopConfig } from '@buildtogether/shared';

/**
 * Sandboxed, typed preload bridge. Exposes a minimal, named surface on `window.bt` —
 * never raw ipcRenderer and never Node APIs. Each method maps to one allowlisted IPC
 * channel; the main process authoritatively validates the sender and every argument.
 * (Electron security recommendations #17 and #20.)
 */
const bridge: DesktopBridge = {
  getConfig: () => ipcRenderer.invoke(IPC.GET_CONFIG) as Promise<DesktopConfig>,

  getPlatformInfo: () =>
    ipcRenderer.invoke(IPC.GET_PLATFORM_INFO) as Promise<{ platform: string; arch: string }>,

  openExternal: (url: string) =>
    ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url) as Promise<{ ok: boolean; reason?: string }>,

  window: {
    minimize: () => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE) as Promise<void>,
    toggleMaximize: () => ipcRenderer.invoke(IPC.WINDOW_TOGGLE_MAXIMIZE) as Promise<void>,
    close: () => ipcRenderer.invoke(IPC.WINDOW_CLOSE) as Promise<void>,
  },
};

contextBridge.exposeInMainWorld('bt', bridge);
