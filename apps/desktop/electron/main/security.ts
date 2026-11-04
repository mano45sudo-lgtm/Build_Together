import { session, shell } from 'electron';
import type { WebContents } from 'electron';
import { isDev, trustedRendererOrigin } from './config';

/**
 * Content Security Policy applied to every renderer document.
 * Production is strict (`script-src 'self'`, no remote content). Development relaxes only
 * what Vite HMR needs (the dev server origin + websocket), never enabling unsafe-eval.
 *
 * Dev exception: `@vitejs/plugin-react` injects an inline Fast-Refresh preamble into the transformed
 * entry HTML. With `script-src 'self'` Chromium blocks it and `main.tsx` throws
 * `Uncaught Error: @vitejs/plugin-react can't detect preamble`, so nothing mounts and the window
 * renders blank. We relax `script-src` to `'self' 'unsafe-inline'` **only in dev**; the packaged
 * build keeps the strict policy because `isDev()` is false there.
 */
export function buildCspHeaderValue(): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    // Tailwind v4 / Motion apply inline styles; scripts remain restricted to 'self'.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    'upgrade-insecure-requests',
  ];

  if (isDev()) {
    // 1) Permit the plugin-react preamble (see docstring above).
    directives.splice(
      directives.indexOf("script-src 'self'"),
      1,
      "script-src 'self' 'unsafe-inline'",
    );
    // 2) Permit HMR + the local dev API regardless of which port Vite actually landed on.
    //    `trustedRendererOrigin()` derives the origin from `ELECTRON_RENDERER_URL`, so an occupied
    //    5173 falling through to 5174 keeps both IPC and HMR working.
    const origin = trustedRendererOrigin();
    const wsOrigin = origin.replace(/^http/, 'ws');
    directives.splice(
      directives.indexOf("connect-src 'self' https:"),
      1,
      `connect-src 'self' https: ${origin} ${wsOrigin} http://localhost:4000`,
    );
    directives.splice(directives.indexOf('upgrade-insecure-requests'), 1);
  }

  return directives.join('; ');
}

/** Attach the CSP header to any HTTP(S)/custom response leaving the session. */
export function registerContentSecurityPolicy(): void {
  const csp = buildCspHeaderValue();
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    // Replace any existing CSP, case-insensitively.
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'content-security-policy') delete headers[key];
    }
    headers['Content-Security-Policy'] = [csp];
    callback({ responseHeaders: headers });
  });
}

/**
 * Deny every permission request unless explicitly allowlisted later. Real permission grants
 * (notifications, etc.) arrive with product features in future phases.
 */
export function registerPermissionGuards(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
}

/**
 * Per-WebContents hardening: block navigation away from our origin and route any
 * window.open to a validated external browser (deny by default).
 */
export function registerWindowGuards(contents: WebContents): void {
  const trusted = trustedRendererOrigin();

  contents.on('will-navigate', (event, targetUrl) => {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.origin !== trusted) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    void routeExternalUrl(url);
    return { action: 'deny' };
  });
}

/** Only well-formed https URLs are allowed to leave the app for the OS browser. */
export async function routeExternalUrl(raw: string): Promise<{ ok: boolean; reason?: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid url' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'only https URLs may be opened externally' };
  }
  await shell.openExternal(url.toString());
  return { ok: true };
}
