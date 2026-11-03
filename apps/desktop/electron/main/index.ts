import { app, BrowserWindow, Menu } from 'electron';
import { join } from 'node:path';
import { createWindow, getMainWindow } from './window';
import { registerIpc } from './ipc';
import { registerContentSecurityPolicy, registerPermissionGuards } from './security';
import { buildApplicationMenu } from './menu';
import { handleAppScheme, registerAppScheme } from './protocol';

// A single-instance desktop app: refocus the existing window instead of opening a second one.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  // Privileged scheme registration must happen before app ready.
  registerAppScheme();

  void app.whenReady().then(() => {
    handleAppScheme(join(__dirname, '../renderer'));
    registerContentSecurityPolicy();
    registerPermissionGuards();
    registerIpc();
    Menu.setApplicationMenu(buildApplicationMenu());
    createWindow();

    // Automated smoke test (BT_SMOKE=1): verify the window loaded the renderer and the
    // secure typed preload/IPC bridge actually works, then shut down. No effect on normal runs.
    if (process.env.BT_SMOKE === '1') {
      const win = getMainWindow();
      win?.webContents.once('did-finish-load', () => {
        void (async () => {
          try {
            const config = await win.webContents.executeJavaScript(
              'window.bt ? window.bt.getConfig() : null',
            );
            const info = await win.webContents.executeJavaScript(
              'window.bt ? window.bt.getPlatformInfo() : null',
            );
            process.stdout.write(
              '[desktop] SMOKE_OK ' +
                JSON.stringify({ url: win.webContents.getURL(), config, info }) +
                '\n',
            );
          } catch (error) {
            console.error(
              '[desktop] SMOKE_FAIL ' + (error instanceof Error ? error.message : String(error)),
            );
          } finally {
            app.quit();
          }
        })();
      });
    }

    app.on('activate', () => {
      // macOS: re-create a window when the dock icon is clicked with none open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    // Quit on Windows/Linux; stay alive on macOS per platform convention.
    if (process.platform !== 'darwin') app.quit();
  });
}
