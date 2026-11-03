import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { isDev } from './config';
import { registerWindowGuards } from './security';
import { RENDERER_URL } from './protocol';

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0d10',
    title: 'BuildTogether',
    autoHideMenuBar: false,
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

  win.on('ready-to-show', () => win.show());
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
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    void win.loadURL(RENDERER_URL);
  }

  return win;
}
