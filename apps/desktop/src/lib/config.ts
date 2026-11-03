import type { DesktopConfig } from '@buildtogether/shared';

/**
 * Renderer-side API base resolution. Inside the desktop app this comes from the trusted
 * main process (`window.bt.getConfig()`), which is environment-aware — never a hardcoded
 * localhost production URL. Outside Electron (tests / plain browser) we fall back to the
 * Vite env var, then a local dev default.
 */
export const FALLBACK_API_BASE_URL = 'http://localhost:4000';

let cachedConfig: DesktopConfig | null = null;

export async function getDesktopConfig(): Promise<DesktopConfig | null> {
  if (typeof window === 'undefined' || !window.bt) return null;
  if (cachedConfig) return cachedConfig;
  cachedConfig = await window.bt.getConfig();
  return cachedConfig;
}

export async function resolveApiBaseUrl(): Promise<string> {
  const config = await getDesktopConfig();
  if (config) return config.apiBaseUrl;
  return import.meta.env.VITE_API_BASE_URL ?? FALLBACK_API_BASE_URL;
}

/** True when running inside the Electron desktop shell (preload bridge present). */
export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && !!window.bt;
}
