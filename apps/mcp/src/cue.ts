import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export interface CueConfig {
  apiUrl: string;
  apiKey: string;
}

/** Reads CUE_API_URL (origin) and CUE_API_KEY (a Clerk API key); never echoes the key. */
export function loadConfig(env: NodeJS.ProcessEnv): CueConfig {
  const rawUrl = env.CUE_API_URL?.trim();
  const apiKey = env.CUE_API_KEY?.trim();
  if (!rawUrl || !apiKey) throw new Error('Set CUE_API_URL and CUE_API_KEY');
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('CUE_API_URL must be an absolute URL, e.g. https://api.example.com');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('CUE_API_URL must use https (http only for localhost)');
  }
  return { apiUrl: url.origin, apiKey };
}

type Fetch = typeof fetch;

/** GET a Cue API path with the API key; returns the envelope's `data` or throws its error message. */
export async function cueGet(
  config: CueConfig,
  path: string,
  doFetch: Fetch = fetch,
): Promise<unknown> {
  const res = await doFetch(`${config.apiUrl}/api/v1${path}`, {
    headers: { accept: 'application/json', authorization: `Bearer ${config.apiKey}` },
  });
  const body = (await res.json().catch(() => null)) as {
    data?: unknown;
    error?: { code?: string; message?: string } | null;
  } | null;
  if (!res.ok || body?.error) {
    throw new Error(
      `${body?.error?.code ?? `HTTP_${res.status}`}: ${body?.error?.message ?? res.statusText}`,
    );
  }
  return body?.data ?? null;
}

// Ids come from the model: restrict them to plain id characters so they can't rewrite the path.
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Expected an id');
const seg = (value: string) => encodeURIComponent(value);

/** Registers the four read-only Cue tools on an MCP server. */
export function registerCueTools(
  server: McpServer,
  config: CueConfig,
  doFetch: Fetch = fetch,
): void {
  const tool =
    (path: (args: Record<string, string>) => string) => async (args: Record<string, string>) => {
      try {
        const data = await cueGet(config, path(args), doFetch);
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: error instanceof Error ? error.message : 'Request failed',
            },
          ],
        };
      }
    };
  const readOnly = { readOnlyHint: true, openWorldHint: false };

  server.registerTool(
    'list_workspaces',
    {
      description: 'List the Cue workspaces you belong to, with your role in each.',
      inputSchema: {},
      annotations: readOnly,
    },
    tool(() => '/workspaces'),
  );
  server.registerTool(
    'list_projects',
    {
      description: 'List the projects you can see in a workspace.',
      inputSchema: { workspaceId: id },
      annotations: readOnly,
    },
    tool(({ workspaceId }) => `/workspaces/${seg(workspaceId!)}/projects`),
  );
  server.registerTool(
    'project_intelligence',
    {
      description:
        'Explainable execution intelligence for one project: health with its factors, blockers, risks, ' +
        'next best actions and decision-revision impact. Every signal carries its evidence.',
      inputSchema: { workspaceId: id, projectId: id },
      annotations: readOnly,
    },
    tool(
      ({ workspaceId, projectId }) =>
        `/workspaces/${seg(workspaceId!)}/intelligence/projects/${seg(projectId!)}/overview`,
    ),
  );
  server.registerTool(
    'my_focus',
    {
      description:
        'Your personal focus in a workspace: overdue, upcoming, blocked and awaiting-review work plus ' +
        'recommended next actions.',
      inputSchema: { workspaceId: id },
      annotations: readOnly,
    },
    tool(({ workspaceId }) => `/workspaces/${seg(workspaceId!)}/intelligence/personal`),
  );
}
