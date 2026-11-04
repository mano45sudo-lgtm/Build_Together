import { isDev, resolveApiBaseUrl } from './config';

/**
 * Development boot ordering: hold window creation until the API is actually accepting requests.
 *
 * `pnpm dev` runs `pnpm -r --parallel dev`, which starts the API and Electron at the same instant.
 * The renderer's very first action is `auth.me()` (restoring any persisted desktop session); if that
 * fires before the API has bound port 4000, the call returns a network error and a genuinely
 * signed-in user is rendered as signed-out on every cold start. Polling the health endpoint first
 * removes the race WITHOUT touching the authentication architecture: it only delays when the window
 * appears, and only in development.
 *
 * It never blocks indefinitely. After the budget elapses we open the window anyway — the normal
 * fail-closed path then surfaces the connection error in-app (never a fake success). Production
 * (`isDev() === false`) targets a real, already-running API and is never gated here.
 */
export async function waitForApiReady(timeoutMs = 20_000): Promise<boolean> {
  if (!isDev()) return true;
  const url = `${resolveApiBaseUrl()}/api/v1/health`;
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no attempt made';

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return true;
      lastError = `HTTP ${res.status}`;
    } catch (error) {
      // Connection refused / DNS while the API is still booting — this is the expected retry case,
      // but we keep the last reason so a persistent failure is reported, not swallowed.
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  console.warn(
    `[desktop] API not reachable at ${url} after ${timeoutMs}ms (${lastError}); ` +
      'opening the window anyway — authentication will surface the connection error in-app.',
  );
  return false;
}
