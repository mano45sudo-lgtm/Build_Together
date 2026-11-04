import type { DesktopBridge, IpcOutcome } from '@buildtogether/shared';

/**
 * Renderer-side access to the typed desktop bridge. The renderer NEVER holds tokens and NEVER talks
 * to the API directly for authenticated operations — it calls a named bridge method and the trusted
 * main process performs the request (ADR-0003 §11). Here we centralize two concerns: (1) requiring
 * the Electron runtime, and (2) unwrapping the safe `IpcOutcome` envelope into a thrown `BridgeError`
 * so calling code can use normal try/catch instead of re-checking `.ok` at every await.
 */

export class BridgeError extends Error {
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(code: string, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
    if (details) this.details = details;
  }
}

/** True when running inside the desktop shell (the preload bridge is present). */
export function hasBridge(): boolean {
  return typeof window !== 'undefined' && !!window.bt;
}

export function requireBridge(): DesktopBridge {
  if (typeof window === 'undefined' || !window.bt) {
    throw new BridgeError(
      'DESKTOP_ONLY',
      'This action is available in the BuildTogether desktop app.',
    );
  }
  return window.bt;
}

/** Await an IPC outcome; return the data or throw a structured `BridgeError`. */
export async function unwrap<T>(call: Promise<IpcOutcome<T>>): Promise<T> {
  const outcome = await call;
  if (outcome.ok) return outcome.data;
  throw new BridgeError(outcome.error.code, outcome.error.message, outcome.error.details);
}

/** Best-effort human message from any thrown value (network/IPC/domain errors alike). */
export function errorMessage(error: unknown): string {
  if (error instanceof BridgeError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
