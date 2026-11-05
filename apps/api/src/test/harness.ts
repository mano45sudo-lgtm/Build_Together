import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ApiResponse, IssuedSession } from '@buildtogether/shared';
import { createApp } from '../app.js';
import { prisma } from '../lib/prisma.js';

/**
 * Lightweight HTTP harness for real, end-to-end integration tests against the migrated PostgreSQL
 * database (no supertest dependency — we drive the actual server with fetch). Each suite starts one
 * server on an ephemeral port and clears the tables between tests for isolation.
 */

export interface CallResult<T = unknown> {
  status: number;
  body: ApiResponse<T>;
}

export interface ReqOptions {
  body?: unknown | undefined;
  token?: string | undefined;
}

export class TestApi {
  private constructor(
    private readonly server: Server,
    readonly baseUrl: string,
  ) {}

  static async start(): Promise<TestApi> {
    const server = createApp().listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;
    return new TestApi(server, `http://127.0.0.1:${port}`);
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  async request<T>(method: string, path: string, opts: ReqOptions = {}): Promise<CallResult<T>> {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;

    const init: RequestInit = { method, headers };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

    const res = await fetch(this.baseUrl + path, init);
    const json = (await res.json().catch(() => null)) as ApiResponse<T>;
    return { status: res.status, body: json };
  }

  get<T>(path: string, token?: string) {
    return this.request<T>('GET', path, { token });
  }
  post<T>(path: string, body?: unknown, token?: string) {
    return this.request<T>('POST', path, { body, token });
  }
  patch<T>(path: string, body?: unknown, token?: string) {
    return this.request<T>('PATCH', path, { body, token });
  }
  del<T>(path: string, token?: string) {
    return this.request<T>('DELETE', path, { token });
  }

  /** Register a user and return their issued session (access + refresh tokens) for authorized calls. */
  async registerAs(name: string, email: string, password: string): Promise<IssuedSession> {
    const res = await this.post<IssuedSession>('/api/v1/auth/register', { name, email, password });
    if (res.status !== 201 || !res.body.data) {
      throw new Error(`registerAs failed: ${res.status} ${JSON.stringify(res.body.error)}`);
    }
    return res.body.data;
  }

  /** Convenience: register and return just the access token. */
  async tokenFor(name: string, email: string, password: string): Promise<IssuedSession> {
    return this.registerAs(name, email, password);
  }
}

/** Wipe all Phase 2 + Phase 3 + Phase 4 + Phase 5 + Phase 6 tables in FK-safe order (children before parents). */
export async function resetDb(): Promise<void> {
  await prisma.notification.deleteMany(); // recipient/actor/workspace refs -> clear before users & workspaces
  await prisma.intelligenceDismissal.deleteMany(); // user refs cascade, but clear explicitly for order
  await prisma.decisionHistory.deleteMany(); // actor is onDelete Restrict -> clear before users
  await prisma.decisionComment.deleteMany(); // author is onDelete Restrict -> clear before users
  await prisma.decisionParticipant.deleteMany();
  await prisma.decisionReference.deleteMany();
  await prisma.decisionAlternative.deleteMany();
  await prisma.decision.deleteMany(); // creator is onDelete Restrict -> clear before users; links cascade anyway
  await prisma.taskActivity.deleteMany(); // actor is onDelete Restrict -> clear before users
  await prisma.taskDependency.deleteMany(); // both endpoints cascade, but clear explicitly for order
  await prisma.task.deleteMany(); // createdBy/assignee + project refs -> clear before projects & users
  await prisma.project.deleteMany(); // owner/creator are onDelete Restrict -> clear before users
  await prisma.nexconnWebhookEvent.deleteMany();
  await prisma.conversationParticipant.deleteMany();
  await prisma.workspaceConversation.deleteMany();
  await prisma.nexconnUserMapping.deleteMany();
  await prisma.workspaceInvitation.deleteMany();
  await prisma.workspaceMembership.deleteMany();
  await prisma.session.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();
}

const STRONG = 'Corr3ct-Horse-Battery';

/** Create a user through the API and return its issued session. */
export async function makeUser(api: TestApi, label: string): Promise<IssuedSession> {
  return api.registerAs(label, `${label.toLowerCase()}@example.com`, STRONG);
}

export const PASSWORD = STRONG;
