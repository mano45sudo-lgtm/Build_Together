import { net, protocol } from 'electron';
import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCspHeaderValue } from './security';

/**
 * Renderer assets are served from a custom, privileged `app://bundle/...` scheme instead of
 * `file://` (Electron security recommendation #18). The handler only ever reads files inside
 * the packaged renderer directory and is path-traversal guarded, and it stamps the CSP header
 * directly onto each response.
 */
export const APP_SCHEME = 'app';
export const APP_HOST = 'bundle';
export const RENDERER_URL = `${APP_SCHEME}://${APP_HOST}/index.html`;

/** Must run before `app` is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}

function textResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export function handleAppScheme(rendererRoot: string): void {
  const root = normalize(rendererRoot);
  protocol.handle(APP_SCHEME, async (request) => {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return textResponse(400, 'bad request');
    }
    if (url.host !== APP_HOST) return textResponse(403, 'forbidden host');

    const decoded = decodeURIComponent(url.pathname);
    const relative = decoded === '/' || decoded === '' ? '/index.html' : decoded;
    const target = normalize(join(root, relative));

    // Confine reads to the renderer directory.
    if (target !== root && !target.startsWith(root + sep)) {
      return textResponse(403, 'forbidden path');
    }

    try {
      const upstream = await net.fetch(pathToFileURL(target).toString());
      const headers = new Headers(upstream.headers);
      headers.set('Content-Security-Policy', buildCspHeaderValue());
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    } catch {
      return textResponse(404, 'not found');
    }
  });
}
