/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Fallback API base URL used only when the renderer runs outside Electron (e.g. jsdom
   * tests or a plain browser). Inside the desktop app the base URL comes from the trusted
   * main process over `window.bt.getConfig()` and is environment-aware.
   */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
