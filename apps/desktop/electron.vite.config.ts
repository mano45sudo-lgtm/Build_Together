import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * electron-vite build model for BuildTogether desktop:
 *  - main    -> Electron main process (out/main)
 *  - preload -> sandboxed, typed contextBridge preload (out/preload)
 *  - renderer-> the reused React app (out/renderer), rooted at ./src
 *
 * `@buildtogether/shared` is unbundled TS source, so it must be BUNDLED into the main/preload
 * output rather than left external (Node cannot import raw .ts at runtime). Hence `exclude`.
 * `is.dev` / `ELECTRON_RENDERER_URL` are injected by electron-vite at dev time.
 */
const bundleShared = externalizeDepsPlugin({ exclude: ['@buildtogether/shared'] });

export default defineConfig({
  main: {
    plugins: [bundleShared],
    build: { lib: { entry: resolve('electron/main/index.ts') } },
  },
  preload: {
    plugins: [bundleShared],
    build: { lib: { entry: resolve('electron/preload/index.ts') } },
  },
  renderer: {
    root: 'src',
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: resolve('src/index.html'),
      },
    },
  },
});
