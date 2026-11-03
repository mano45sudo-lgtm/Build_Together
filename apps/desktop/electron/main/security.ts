import { session, shell } from 'electron';
import type { WebContents } from 'electron';
import { isDev, trustedRendererOrigin } from './config';

/**
 * Content Security Policy applied to every renderer document.
 * Production is strict (`script-src 'self'`, no remote content). Development relaxes only
 * what Vite HMR needs (the dev server origin + websocket), never enabling unsafe-eval.
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
    // Allow HMR + the local dev API only in development.
    directives.splice(
      directives.indexOf("connect-src 'self' https:"),
      1,
      "connect-src 'self' https: http://localhost:5173 ws://localhost:5173 http://localhost:4000",
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
