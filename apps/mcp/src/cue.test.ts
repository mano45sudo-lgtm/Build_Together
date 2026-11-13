import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig, registerCueTools } from './cue.js';

const config = { apiUrl: 'https://api.example.com', apiKey: 'ak_test_secret' };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function connect(fetchImpl: typeof fetch) {
  const server = new McpServer({ name: 'cue', version: 'test' });
  registerCueTools(server, config, fetchImpl);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: 'test' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

const text = (result: unknown) => (result as { content: Array<{ text: string }> }).content[0]!.text;

describe('loadConfig', () => {
  it('requires both values and keeps only the origin', () => {
    expect(() => loadConfig({})).toThrow(/CUE_API_URL and CUE_API_KEY/);
    expect(loadConfig({ CUE_API_URL: 'https://api.example.com/x', CUE_API_KEY: 'k' }).apiUrl).toBe(
      'https://api.example.com',
    );
  });

  it('allows http only for localhost', () => {
    expect(loadConfig({ CUE_API_URL: 'http://localhost:4000', CUE_API_KEY: 'k' }).apiUrl).toBe(
      'http://localhost:4000',
    );
    expect(() => loadConfig({ CUE_API_URL: 'http://api.example.com', CUE_API_KEY: 'k' })).toThrow(
      /https/,
    );
  });

  it('never echoes the key in errors', () => {
    try {
      loadConfig({ CUE_API_URL: 'not a url', CUE_API_KEY: 'super-secret' });
    } catch (error) {
      expect((error as Error).message).not.toContain('super-secret');
    }
  });
});

describe('Cue MCP tools', () => {
  it('exposes exactly four read-only tools', async () => {
    const client = await connect(vi.fn());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'list_projects',
      'list_workspaces',
      'my_focus',
      'project_intelligence',
    ]);
    expect(tools.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
  });

  it('calls the overview route with the API key and returns its data', async () => {
    const fetchImpl = vi.fn(async () =>
      json(200, { data: { health: { state: 'AT_RISK' } }, error: null }),
    );
    const client = await connect(fetchImpl);
    const result = await client.callTool({
      name: 'project_intelligence',
      arguments: { workspaceId: 'ws_1', projectId: 'p_1' },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/workspaces/ws_1/intelligence/projects/p_1/overview',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer ak_test_secret' }),
      }),
    );
    expect(JSON.parse(text(result))).toEqual({ health: { state: 'AT_RISK' } });
  });

  it('reports API errors without throwing', async () => {
    const client = await connect(
      vi.fn(async () =>
        json(401, {
          data: null,
          error: { code: 'INVALID_API_KEY', message: 'API key is invalid' },
        }),
      ),
    );
    const result = await client.callTool({ name: 'my_focus', arguments: { workspaceId: 'ws_1' } });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe('INVALID_API_KEY: API key is invalid');
  });

  it('rejects ids that could rewrite the request path', async () => {
    const fetchImpl = vi.fn();
    const client = await connect(fetchImpl);
    const result = await client.callTool({
      name: 'project_intelligence',
      arguments: { workspaceId: '../../auth', projectId: 'p_1' },
    });
    expect(result.isError).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
