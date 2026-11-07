import { app, BrowserWindow, screen } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IPC } from '@buildtogether/shared';
import { isDev } from './config';
import { registerWindowGuards } from './security';
import { RENDERER_URL } from './protocol';
import { restoreWindowState, type WorkArea, type WindowState } from './window-state';

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function getWorkAreas(): WorkArea[] {
  return screen.getAllDisplays().map(({ workArea }) => ({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
  }));
}

function getPrimaryWorkArea(): WorkArea {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height };
}

function readSavedState(): WindowState {
  try {
    const stored = JSON.parse(
      readFileSync(join(app.getPath('userData'), 'window-state.json'), 'utf8'),
    );
    return restoreWindowState(stored, getWorkAreas(), getPrimaryWorkArea());
  } catch {
    return restoreWindowState(null, getWorkAreas(), getPrimaryWorkArea());
  }
}

function notifyWindowState(win: BrowserWindow): void {
  if (!win.webContents.isDestroyed()) {
    win.webContents.send(IPC.WINDOW_STATE_CHANGED, {
      isMaximized: win.isMaximized(),
      isFullScreen: win.isFullScreen(),
    });
  }
}

function persistWindowState(win: BrowserWindow): void {
  try {
    const normal = win.getNormalBounds();
    const state = restoreWindowState(
      {
        ...normal,
        isMaximized: win.isMaximized(),
      },
      getWorkAreas(),
      getPrimaryWorkArea(),
    );
    writeFileSync(join(app.getPath('userData'), 'window-state.json'), JSON.stringify(state));
  } catch (error) {
    console.error('[desktop] unable to persist window state', error);
  }
}

export function createWindow(): BrowserWindow {
  const savedState = readSavedState();
  const win = new BrowserWindow({
    x: savedState.x,
    y: savedState.y,
    width: savedState.width,
    height: savedState.height,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#0a0a0a',
    title: 'Cue',
    frame: process.platform !== 'win32',
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    autoHideMenuBar: process.platform === 'win32',
    webPreferences: {
      // Security posture (Electron checklist #2, #3, #4, #6): no Node in the renderer,
      // strong isolation, and a sandboxed process.
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: isDev(),
    },
  });
  mainWindow = win;

  if (savedState.isMaximized) win.maximize();

  win.on('ready-to-show', () => win.show());
  win.on('maximize', () => notifyWindowState(win));
  win.on('unmaximize', () => notifyWindowState(win));
  win.on('enter-full-screen', () => notifyWindowState(win));
  win.on('leave-full-screen', () => notifyWindowState(win));
  win.on('close', () => persistWindowState(win));
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // Surface meaningful application errors to the main-process log.
  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`[desktop] failed to load ${validatedUrl}: ${errorCode} ${errorDescription}`);
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[desktop] renderer process gone: ${details.reason} (${details.exitCode})`);
  });
  win.webContents.on('unresponsive', () => {
    console.error('[desktop] renderer is unresponsive');
  });

  registerWindowGuards(win.webContents);

  if (isDev()) {
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (!devUrl) {
      throw new Error('ELECTRON_RENDERER_URL is not set — launch via `electron-vite dev`.');
    }
    void win.loadURL(devUrl);
  } else {
    void win.loadURL(RENDERER_URL);
  }

  return win;
}
