import { app, BrowserWindow, Menu } from 'electron';
import { join } from 'node:path';
import { createWindow, getMainWindow } from './window';
import { registerIpc } from './ipc';
import { waitForApiReady } from './api-ready';
import { registerContentSecurityPolicy, registerPermissionGuards } from './security';
import { buildApplicationMenu } from './menu';
import { handleAppScheme, registerAppScheme } from './protocol';
import { loadSession } from './session-store';

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

  void app.whenReady().then(async () => {
    handleAppScheme(join(__dirname, '../renderer'));
    registerContentSecurityPolicy();
    registerPermissionGuards();
    // Restore any encrypted session AND wait for the API (dev only) before the renderer boots, so a
    // persisted session is recognized rather than raced into a spurious signed-out state. These are
    // independent, so run them together. Production returns from waitForApiReady immediately.
    await Promise.all([loadSession(), waitForApiReady()]);
    registerIpc();
    Menu.setApplicationMenu(buildApplicationMenu());
    createWindow();

    // Automated smoke test (BT_SMOKE=1): verify the window loaded the renderer, the React root
    // actually MOUNTED (a blank `#root` is the classic CSP / plugin-react preamble failure
    // signature), the preload/IPC bridge works, and no uncaught renderer errors fired. Failing
    // here exits with code 1 so `pnpm dev` / CI surfaces the regression instead of shipping a
    // black window. No effect on normal runs.
    if (process.env.BT_SMOKE === '1') {
      const win = getMainWindow();
      const rendererErrors: string[] = [];
      if (win) {
        win.webContents.on('console-message', (_event, level, message) => {
          // Electron console levels: 0=verbose, 1=info, 2=warning, 3=error. Only genuine page
          // errors mark the smoke as failed — the React DevTools tip is `info`, and Vite's HMR
          // log lines are `verbose`, so neither trips the check. A blank window is exactly what
          // an uncaught error looks like, so we surface those.
          if (level === 3) rendererErrors.push(String(message));
        });
        win.webContents.once('did-finish-load', () => {
          void (async () => {
            type MountResult = { ok: boolean; nodes?: number; html?: string | null };
            let ok = false;
            let payload: Record<string, unknown>;
            try {
              // React mounts asynchronously after module evaluation; poll for a couple of frames.
              const mounted = (await win.webContents.executeJavaScript(`
                new Promise((resolve) => {
                  const deadline = performance.now() + 1500;
                  const tick = () => {
                    const root = document.getElementById('root');
                    if (root && root.children.length > 0) {
                      resolve({ ok: true, nodes: root.children.length });
                      return;
                    }
                    if (performance.now() > deadline) {
                      resolve({
                        ok: false,
                        html: root ? root.innerHTML.slice(0, 200) : null,
                      });
                      return;
                    }
                    requestAnimationFrame(tick);
                  };
                  tick();
                });
              `)) as MountResult;
              const config = await win.webContents.executeJavaScript(
                'window.bt ? window.bt.getConfig() : null',
              );
              const info = await win.webContents.executeJavaScript(
                'window.bt ? window.bt.getPlatformInfo() : null',
              );
              ok = mounted.ok === true && rendererErrors.length === 0;
              payload = {
                url: win.webContents.getURL(),
                mounted,
                config,
                info,
                rendererErrors,
              };
            } catch (error) {
              payload = {
                error: error instanceof Error ? error.message : String(error),
                rendererErrors,
              };
            }
            process.stdout.write(
              `[desktop] SMOKE_${ok ? 'OK' : 'FAIL'} ` + JSON.stringify(payload) + '\n',
            );
            if (ok) app.quit();
            else app.exit(1);
          })();
        });
      }
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
