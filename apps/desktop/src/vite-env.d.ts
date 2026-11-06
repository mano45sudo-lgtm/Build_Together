/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Fallback API base URL used only when the renderer runs outside Electron (e.g. jsdom
   * tests or a plain browser). Inside the desktop app the base URL comes from the trusted
   * main process over `window.bt.getConfig()` and is environment-aware.
   */
  readonly VITE_API_BASE_URL?: string;

  /**
   * Clerk publishable (frontend) key — a PUBLIC, non-secret value that identifies the Clerk
   * instance. It is safe to embed in the renderer bundle and is consumed by `ClerkProvider`.
   * The matching SECRET key lives only on the API server (`CLERK_SECRET_KEY`), never here.
   */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
