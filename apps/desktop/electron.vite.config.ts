import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { resolveClerkFrontendApiHost } from './electron/main/clerk-host';
import { resolveApiBaseUrlFor } from './electron/main/api-config';
import { assertNoSharedEnvironmentValues, buildEnvironmentForMode } from './electron/build-env';

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
  // Development and production are separate configurations: `electron-vite dev` uses mode
  // "development" (.env.development), `electron-vite build` uses "production" (.env.production).
  // Real process env wins over files so CI can inject production values without a file on disk.
  const environment = buildEnvironmentForMode(mode);
  const envDir = import.meta.dirname;
  // Shared files are read in every mode; only a production build is harmed by what they hold.
  if (environment === 'production') assertNoSharedEnvironmentValues(envDir);
  const fileEnv = loadEnv(mode, envDir, '');
  const setting = (key: string): string | undefined => process.env[key] ?? fileEnv[key];

  // Same validator the main process re-applies at runtime, so a bad endpoint fails the build.
  const apiBaseUrl = resolveApiBaseUrlFor(environment, setting('BT_API_BASE_URL'));
  const clerkFrontendApiHost = resolveClerkFrontendApiHost({
    host: setting('VITE_CLERK_FRONTEND_API_HOST'),
    publishableKey: setting('VITE_CLERK_PUBLISHABLE_KEY'),
    development: environment === 'development',
  });

  return {
    main: {
      plugins: [bundleShared],
      define: {
        'process.env.CUE_CLERK_FRONTEND_API_HOST': JSON.stringify(clerkFrontendApiHost ?? ''),
        CUE_API_BASE_URL: JSON.stringify(apiBaseUrl),
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
