import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ApiResponse, HealthReport } from '@buildtogether/shared';
import { createApp } from './app.js';

// Toolchain smoke test: starts the app on an ephemeral port and checks the health endpoint
// returns the shared response envelope. No supertest dependency needed. Feature/integration
// tests are added in later phases per the testing-qa skill.
describe('api scaffold', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createApp().listen(0);
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/v1/health returns ok envelope', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiResponse<HealthReport>;
    expect(body.error).toBeNull();
    expect(body.data?.status).toBe('ok');
  });

  it('unknown route returns NOT_FOUND envelope', async () => {
    const res = await fetch(`${baseUrl}/api/v1/nope`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as ApiResponse<null>;
    expect(body.data).toBeNull();
    expect(body.error?.code).toBe('NOT_FOUND');
  });
});
