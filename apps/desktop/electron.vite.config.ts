import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { resolveClerkFrontendApiHost } from './electron/main/clerk-host';

/**
 * electron-vite build model for BuildTogether desktop:
 *  - main    -> Electron main process (out/main)
 *  - preload -> sandboxed, typed contextBridge preload (out/preload)
 *  - renderer-> the reused React app (out/renderer), rooted at ./src
 *
 * `@buildtogether/shared` is unbundled TS source, so it must be BUNDLED into the main/preload
 * output rather than left external (Node cannot import raw .ts at runtime). Hence `exclude`.
 * `is.dev` / `ELECTRON_RENDERER_URL` are injected by electron-vite at dev time.
 *
 * The PRELOAD additionally bundles `@clerk/electron`: a SANDBOXED preload cannot `require` an npm
 * module from inside the packaged `app.asar`, so leaving `@clerk/electron/preload` external made the
 * packaged preload fail with "module not found: @clerk/electron/preload" — which silently killed
 * `window.bt` AND `exposeClerkBridge()` (Clerk's token cache + OAuth transport), breaking social
 * sign-in and session persistence only in the built app. Bundling it makes the preload self-contained.
 * `electron` itself stays external (electron-vite always externalizes it), which is what the preload
 * legitimately needs from the runtime.
 */
const bundleShared = externalizeDepsPlugin({ exclude: ['@buildtogether/shared'] });
const bundleSharedAndClerk = externalizeDepsPlugin({
  exclude: ['@buildtogether/shared', '@clerk/electron'],
});

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, import.meta.dirname, '');
  const clerkFrontendApiHost = resolveClerkFrontendApiHost({
    host: process.env.VITE_CLERK_FRONTEND_API_HOST ?? fileEnv.VITE_CLERK_FRONTEND_API_HOST,
    publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY ?? fileEnv.VITE_CLERK_PUBLISHABLE_KEY,
    development: mode !== 'production',
  });

  return {
    main: {
      plugins: [bundleShared],
      define: {
        'process.env.CUE_CLERK_FRONTEND_API_HOST': JSON.stringify(clerkFrontendApiHost ?? ''),
      },
      build: { lib: { entry: resolve('electron/main/index.ts') } },
    },
    preload: {
      plugins: [bundleSharedAndClerk],
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
  };
});
