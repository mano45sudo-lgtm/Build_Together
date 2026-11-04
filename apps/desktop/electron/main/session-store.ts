import { app, safeStorage } from 'electron';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Desktop session persistence (ADR-0003 §4). The MAIN process is the sole holder of the
 * opaque access/refresh token pair. It is kept in memory for the running session and, when the
 * OS secret store is available, persisted to disk encrypted via Electron `safeStorage`
 * (DPAPI on Windows, Keychain on macOS, libsecret on Linux) so the desktop session survives
 * restarts.
 *
 * SECURITY: raw tokens NEVER reach the renderer, and are NEVER written to disk in plaintext.
 * If `safeStorage` is unavailable (e.g. an unlocked keyring / unsupported headless Linux), we
 * fail *non-silently but safe*: the session stays in memory only and a warning is logged — we
 * would rather lose persistence than store credentials unencrypted.
 */

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

let current: StoredTokens | null = null;

function storePath(): string {
  return join(app.getPath('userData'), 'bt-session.bin');
}

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/** Load any persisted, decryptable session into memory at startup. Corrupt/missing ⇒ signed out. */
export async function loadSession(): Promise<void> {
  if (!encryptionAvailable()) return;
  try {
    const bytes = await readFile(storePath());
    current = JSON.parse(safeStorage.decryptString(bytes)) as StoredTokens;
  } catch {
    current = null;
  }
}

export function getTokens(): StoredTokens | null {
  return current;
}

/** Replace (or clear, with `null`) the in-memory session and mirror it to encrypted storage. */
export async function setTokens(tokens: StoredTokens | null): Promise<void> {
  current = tokens;

  if (!tokens) {
    await rm(storePath(), { force: true }).catch(() => undefined);
    return;
  }

  if (!encryptionAvailable()) {
    console.error(
      '[desktop] OS secret store unavailable — session kept in memory only and will not survive restart',
    );
    return;
  }

  const encrypted = safeStorage.encryptString(JSON.stringify(tokens));
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(storePath(), encrypted);
}
