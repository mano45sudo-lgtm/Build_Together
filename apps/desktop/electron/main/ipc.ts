import { BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { IPC } from '@buildtogether/shared';
import { resolveDesktopConfig, trustedRendererOrigin } from './config';
import { routeExternalUrl } from './security';

/**
 * IPC registration. Every handler validates that the calling frame is our own trusted
 * renderer origin (Electron security recommendation #17) before doing anything privileged.
 * Untrusted senders are rejected, never served.
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

export function registerIpc(): void {
  ipcMain.handle(IPC.GET_CONFIG, (event) => {
    assertTrustedSender(event);
    return resolveDesktopConfig();
  });

  ipcMain.handle(IPC.GET_PLATFORM_INFO, (event) => {
    assertTrustedSender(event);
    return { platform: process.platform, arch: process.arch };
  });

  ipcMain.handle(IPC.OPEN_EXTERNAL, async (event, url: unknown) => {
    assertTrustedSender(event);
    if (typeof url !== 'string') {
      return { ok: false, reason: 'url must be a string' };
    }
    return routeExternalUrl(url);
  });

  ipcMain.handle(IPC.WINDOW_MINIMIZE, (event) => {
    assertTrustedSender(event);
    windowOf(event)?.minimize();
  });

  ipcMain.handle(IPC.WINDOW_TOGGLE_MAXIMIZE, (event) => {
    assertTrustedSender(event);
    const win = windowOf(event);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.handle(IPC.WINDOW_CLOSE, (event) => {
    assertTrustedSender(event);
    windowOf(event)?.close();
  });
}
