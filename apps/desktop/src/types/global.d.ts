import type { DesktopBridge } from '@buildtogether/shared';

declare global {
  interface Window {
    /**
     * Typed desktop bridge installed by the sandboxed preload script.
     * Undefined when the renderer runs outside Electron (e.g. jsdom unit tests),
     * so renderer code must feature-detect (`window.bt?.…`) before use.
     */
    bt?: DesktopBridge;
  }
}

export {};
