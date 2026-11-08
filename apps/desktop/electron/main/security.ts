import { session, shell } from 'electron';
import type { WebContents } from 'electron';
import { isDev, trustedRendererOrigin } from './config';
import { clerkCspSources } from './clerk-host';

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
 *
 * Clerk (ADR-0006): the auth screens are our own components driving Clerk's hooks
 * (`@clerk/electron/react`). `ClerkProvider` still loads Clerk's client bundle from the configured Clerk
 * Frontend API host and opens a `wss://` session channel, so script/image/font policy must allow that
 * exact host or the provider never finishes loading and the app hangs on the boot splash (`isLoaded`
 * stays false). Google OAuth runs in the system browser, not an iframe, so `frame-src 'none'` stays.
 * (If the Dashboard enables bot-protection captcha for sign-up, that widget needs `frame-src` and
 * script hosts — revisit then, not preemptively.)
 */
export function buildCspHeaderValue(): string {
  const clerkHost = process.env.CUE_CLERK_FRONTEND_API_HOST;
  const clerkSources = clerkHost ? clerkCspSources(clerkHost, isDev()) : undefined;
  const clerkOrigin = clerkSources?.frontendApi;
  const clerkSocket = clerkSources?.frontendSocket;
  // Clerk's hosted avatars use img.clerk.com; script/font/FAPI access stays scoped to this exact
  // instance hostname. Do not use a wildcard over every Clerk instance.
  const clerkImageHost = clerkSources?.images;
  const clerkScriptSources = clerkOrigin ? ` ${clerkOrigin}` : '';
  const scriptSrcSelf = `script-src 'self'${clerkScriptSources}`;
  const connectSrcBase = `connect-src 'self' https: wss:${clerkOrigin ? ` ${clerkOrigin} ${clerkSocket}` : ''}`;
  const directives = [
    "default-src 'self'",
    scriptSrcSelf,
    // Tailwind v4 / Motion apply inline styles; scripts remain restricted to 'self' + the Clerk CDN.
    "style-src 'self' 'unsafe-inline'",
    // Clerk's prebuilt UI serves icon/avatar images and embedded fonts from the same CDN hosts.
    `img-src 'self' data: blob:${clerkImageHost ? ` ${clerkImageHost}` : ''}${clerkScriptSources}`,
    `font-src 'self' data:${clerkScriptSources}`,
    connectSrcBase,
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    'upgrade-insecure-requests',
  ];

  if (isDev()) {
    // 1) Permit the plugin-react preamble (see docstring above), keeping the Clerk CDN hosts.
    directives.splice(
      directives.indexOf(scriptSrcSelf),
      1,
      `script-src 'self' 'unsafe-inline'${clerkScriptSources}`,
    );
    // 2) Permit HMR + the local dev API regardless of which port Vite actually landed on.
    //    `trustedRendererOrigin()` derives the origin from `ELECTRON_RENDERER_URL`, so an occupied
    //    5173 falling through to 5174 keeps both IPC and HMR working.
    const origin = trustedRendererOrigin();
    const wsOrigin = origin.replace(/^http/, 'ws');
    directives.splice(
      directives.indexOf(connectSrcBase),
      1,
      `connect-src 'self' https: wss: ${origin} ${wsOrigin} http://localhost:4000`,
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
