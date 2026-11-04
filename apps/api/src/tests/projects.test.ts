import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  IssuedSession,
  ProjectOverview,
  ProjectView,
  WorkspaceSummary,
} from '@buildtogether/shared';
import { prisma } from '../lib/prisma.js';
import { PASSWORD, resetDb, TestApi } from '../test/harness.js';

const PW = PASSWORD;
const BASE = (wsId: string) => `/api/v1/workspaces/${wsId}/projects`;

interface Ctx {
  api: TestApi;
  owner: IssuedSession;
  admin: IssuedSession;
  member: IssuedSession;
  otherMember: IssuedSession;
  outsider: IssuedSession;
  workspaceId: string;
}

/** A workspace with an OWNER, an ADMIN, two plain MEMBERs and an outsider (member of nothing). */
async function buildTeam(api: TestApi): Promise<Ctx> {
  const owner = await api.registerAs('Olivia Owner', 'olivia@example.com', PW);
  const admin = await api.registerAs('Mark Admin', 'mark@example.com', PW);
  const member = await api.registerAs('Wendy Member', 'wendy@example.com', PW);
  const otherMember = await api.registerAs('Peter Member', 'peter@example.com', PW);
  const outsider = await api.registerAs('Nina Outsider', 'nina@example.com', PW);

  const ws = await api.post<WorkspaceSummary>(
    '/api/v1/workspaces',
    { name: 'Acme', description: 'demo' },
    owner.tokens.accessToken,
  );
  const workspaceId = ws.body.data!.id;

  await prisma.workspaceMembership.createMany({
    data: [
      { workspaceId, userId: admin.session.user.id, role: 'ADMIN' },
      { workspaceId, userId: member.session.user.id, role: 'MEMBER' },
      { workspaceId, userId: otherMember.session.user.id, role: 'MEMBER' },
    ],
  });
  return { api, owner, admin, member, otherMember, outsider, workspaceId };
}

/**
 * Phase 4 project endpoints against the real API + migrated PostgreSQL. These assert the brief's
 * promises: server-side RBAC (workspace role + project ownership), strict workspace isolation,
 * PRIVATE-visibility scoping, key/slug auto-generation + de-duplication, archive via `archivedAt`,
 * and search / filter / cursor pagination — never trusting anything the client claims.
 */
describe('projects', () => {
  let api: TestApi;
  let ctx: Ctx;

  beforeAll(async () => {
    api = await TestApi.start();
  });
  afterAll(async () => {
    await api?.stop();
  });
  beforeEach(async () => {
    await resetDb();
    ctx = await buildTeam(api);
  });

  const tok = (s: IssuedSession) => s.tokens.accessToken;
  const uid = (s: IssuedSession) => s.session.user.id;

  async function create(
    session: IssuedSession,
    body: Record<string, unknown>,
  ): Promise<{ status: number; data: ProjectView | undefined; code: string | undefined }> {
    const res = await api.post<ProjectView>(BASE(ctx.workspaceId), body, tok(session));
    return { status: res.status, data: res.body.data ?? undefined, code: res.body.error?.code };
  }

  // ---- create ----

  it('a MEMBER can create a project; owner defaults to the creator, key + slug are generated', async () => {
    const res = await create(ctx.member, { name: 'Website Relaunch' });
    expect(res.status).toBe(201);
    const p = res.data!;
    expect(p.name).toBe('Website Relaunch');
    expect(p.owner.id).toBe(uid(ctx.member));
    expect(p.createdById).toBe(uid(ctx.member));
    expect(p.status).toBe('ACTIVE');
    expect(p.visibility).toBe('WORKSPACE');
    expect(p.projectKey).toMatch(/^[A-Z0-9_-]{2,12}$/);
    expect(p.slug).toBe('website-relaunch');
    expect(p.archivedAt).toBeNull();
  });

  it('rejects an empty project name (validation at the edge)', async () => {
    const res = await create(ctx.owner, { name: '   ' });
    expect(res.status).toBe(400);
    expect(res.code).toBe('VALIDATION_FAILED');
  });

  it('de-duplicates a suggested key already used in the workspace (never silently collides)', async () => {
    const first = await create(ctx.owner, { name: 'Alpha', projectKey: 'ALPHA' });
    expect(first.status).toBe(201);
    expect(first.data!.projectKey).toBe('ALPHA');
    const second = await create(ctx.owner, { name: 'Alpha Two', projectKey: 'alpha' });
    expect(second.status).toBe(201);
    expect(second.data!.projectKey).toBe('ALPHA-2');
  });

  it('a plain MEMBER cannot create a project for a DIFFERENT owner (admin-only)', async () => {
    const res = await create(ctx.member, { name: 'Sneaky', ownerId: uid(ctx.otherMember) });
    expect(res.status).toBe(403);
    expect(res.code).toBe('INSUFFICIENT_ROLE');
  });

  it('an ADMIN can create a project owned by another workspace member', async () => {
    const res = await create(ctx.admin, { name: 'Assigned', ownerId: uid(ctx.member) });
    expect(res.status).toBe(201);
    expect(res.data!.owner.id).toBe(uid(ctx.member));
  });

  it('refuses to assign an owner who is not a workspace member', async () => {
    const res = await create(ctx.owner, { name: 'Ghost', ownerId: uid(ctx.outsider) });
    expect(res.status).toBe(400);
    expect(res.code).toBe('OWNER_NOT_MEMBER');
  });

  it('rejects an invalid date value', async () => {
    const res = await create(ctx.owner, { name: 'Dated', startDate: 'not-a-date' });
    expect(res.status).toBe(400);
  });

  // ---- list / scope / filter / search ----

  it('lists only non-archived projects by default (scope=active)', async () => {
    const live = await create(ctx.owner, { name: 'Live Project' });
    const done = await create(ctx.owner, { name: 'Done Project' });
    await api.post(`${BASE(ctx.workspaceId)}/${done.data!.id}/archive`, undefined, tok(ctx.owner));

    const list = await api.get<ProjectView[]>(BASE(ctx.workspaceId), tok(ctx.owner));
    expect(list.status).toBe(200);
    const ids = list.body.data!.map((p) => p.id);
    expect(ids).toContain(live.data!.id);
    expect(ids).not.toContain(done.data!.id);

    const archived = await api.get<ProjectView[]>(
      `${BASE(ctx.workspaceId)}?scope=archived`,
      tok(ctx.owner),
    );
    expect(archived.body.data!.map((p) => p.id)).toEqual([done.data!.id]);
  });

  it('filters by status and searches by name / key (case-insensitive)', async () => {
    await create(ctx.owner, { name: 'Mobile App', projectKey: 'MOB' });
    await create(ctx.owner, { name: 'Data Pipeline', status: 'PLANNING' });

    const byStatus = await api.get<ProjectView[]>(
      `${BASE(ctx.workspaceId)}?status=PLANNING`,
      tok(ctx.owner),
    );
    expect(byStatus.body.data!.map((p) => p.name)).toEqual(['Data Pipeline']);

    const bySearch = await api.get<ProjectView[]>(
      `${BASE(ctx.workspaceId)}?search=mobile`,
      tok(ctx.owner),
    );
    expect(bySearch.body.data).toHaveLength(1);
    expect(bySearch.body.data![0]!.projectKey).toBe('MOB');
  });

  it('paginates with a forward cursor in the meta envelope', async () => {
    for (let i = 1; i <= 5; i += 1) await create(ctx.owner, { name: `Project ${i}` });
    const page1 = await api.get<ProjectView[]>(
      `${BASE(ctx.workspaceId)}?limit=2&sort=name&dir=asc`,
      tok(ctx.owner),
    );
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta?.cursor).toBeTruthy();

    const cursor = page1.body.meta!.cursor as string;
    const page2 = await api.get<ProjectView[]>(
      `${BASE(ctx.workspaceId)}?limit=2&sort=name&dir=asc&cursor=${encodeURIComponent(cursor)}`,
      tok(ctx.owner),
    );
    expect(page2.body.data).toHaveLength(2);
    const overlap = page2.body.data!.some((p) => page1.body.data!.some((q) => q.id === p.id));
    expect(overlap).toBe(false);
  });

  // ---- read single + overview ----

  it('reads a project and its overview by id', async () => {
    const created = await create(ctx.member, { name: 'Readable' });
    const id = created.data!.id;
    const got = await api.get<ProjectView>(`${BASE(ctx.workspaceId)}/${id}`, tok(ctx.member));
    expect(got.status).toBe(200);
    expect(got.body.data!.name).toBe('Readable');

    const overview = await api.get<ProjectOverview>(
      `${BASE(ctx.workspaceId)}/${id}/overview`,
      tok(ctx.member),
    );
    expect(overview.status).toBe(200);
    expect(overview.body.data!.workspace.name).toBe('Acme');
    expect(overview.body.data!.project.id).toBe(id);
  });

  // ---- PRIVATE visibility ----

  it('hides a PRIVATE project from a fellow MEMBER (404 + excluded from list) but shows it to OWNER/ADMIN', async () => {
    const priv = await create(ctx.member, { name: 'Secret', visibility: 'PRIVATE' });
    const id = priv.data!.id;

    const asStranger = await api.get(`${BASE(ctx.workspaceId)}/${id}`, tok(ctx.otherMember));
    expect(asStranger.status).toBe(404);
    const strangerList = await api.get<ProjectView[]>(
      `${BASE(ctx.workspaceId)}?scope=all`,
      tok(ctx.otherMember),
    );
    expect(strangerList.body.data!.some((p) => p.id === id)).toBe(false);

    const asCreator = await api.get(`${BASE(ctx.workspaceId)}/${id}`, tok(ctx.member));
    expect(asCreator.status).toBe(200);

    const asAdmin = await api.get(`${BASE(ctx.workspaceId)}/${id}`, tok(ctx.admin));
    expect(asAdmin.status).toBe(200);
  });

  // ---- update + ownership rules ----

  it('lets the project owner update it; blocks a fellow MEMBER who neither owns nor created it', async () => {
    const created = await create(ctx.member, { name: 'Renamable' });
    const id = created.data!.id;

    const ok = await api.patch<ProjectView>(
      `${BASE(ctx.workspaceId)}/${id}`,
      { name: 'Renamed' },
      tok(ctx.member),
    );
    expect(ok.status).toBe(200);
    expect(ok.body.data!.name).toBe('Renamed');

    const denied = await api.patch(
      `${BASE(ctx.workspaceId)}/${id}`,
      { name: 'Hijacked' },
      tok(ctx.otherMember),
    );
    expect(denied.status).toBe(403);
    expect(denied.body.error?.code).toBe('INSUFFICIENT_ROLE');
  });

  it('an ADMIN can manage any project in the workspace', async () => {
    const created = await create(ctx.member, { name: 'Admin Managed' });
    const res = await api.patch<ProjectView>(
      `${BASE(ctx.workspaceId)}/${created.data!.id}`,
      { status: 'ON_HOLD' },
      tok(ctx.admin),
    );
    expect(res.status).toBe(200);
    expect(res.body.data!.status).toBe('ON_HOLD');
  });

  it('rejects an empty update payload (at least one field required)', async () => {
    const created = await create(ctx.owner, { name: 'No Fields' });
    const res = await api.patch(`${BASE(ctx.workspaceId)}/${created.data!.id}`, {}, tok(ctx.owner));
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_FAILED');
  });

  it('reassigns the owner to another member (never leaves the project ownerless)', async () => {
    const created = await create(ctx.owner, { name: 'Reassign' });
    const res = await api.patch<ProjectView>(
      `${BASE(ctx.workspaceId)}/${created.data!.id}`,
      { ownerId: uid(ctx.member) },
      tok(ctx.owner),
    );
    expect(res.status).toBe(200);
    expect(res.body.data!.owner.id).toBe(uid(ctx.member));
    const updated = await api.get<ProjectView>(
      `${BASE(ctx.workspaceId)}/${created.data!.id}`,
      tok(ctx.owner),
    );
    expect(updated.body.data!.owner.id).toBe(uid(ctx.member));
  });

  it('refuses to reassign the owner to a non-member', async () => {
    const created = await create(ctx.owner, { name: 'Bad Reassign' });
    const res = await api.patch(
      `${BASE(ctx.workspaceId)}/${created.data!.id}`,
      { ownerId: uid(ctx.outsider) },
      tok(ctx.owner),
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('OWNER_NOT_MEMBER');
  });

  // ---- archive / restore ----

  it('archives and restores a project via archivedAt (idempotent both ways)', async () => {
    const created = await create(ctx.owner, { name: 'Archivable' });
    const id = created.data!.id;

    const arch1 = await api.post<ProjectView>(
      `${BASE(ctx.workspaceId)}/${id}/archive`,
      undefined,
      tok(ctx.owner),
    );
    expect(arch1.status).toBe(200);
    expect(arch1.body.data!.archivedAt).not.toBeNull();

    const arch2 = await api.post<ProjectView>(
      `${BASE(ctx.workspaceId)}/${id}/archive`,
      undefined,
      tok(ctx.owner),
    );
    expect(arch2.body.data!.archivedAt).toBe(arch1.body.data!.archivedAt); // idempotent

    const restore = await api.post<ProjectView>(
      `${BASE(ctx.workspaceId)}/${id}/restore`,
      undefined,
      tok(ctx.owner),
    );
    expect(restore.status).toBe(200);
    expect(restore.body.data!.archivedAt).toBeNull();
  });

  // ---- authorization boundaries ----

  it('denies a non-member the whole collection (workspace isolation)', async () => {
    const res = await api.get(BASE(ctx.workspaceId), tok(ctx.outsider));
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('NOT_A_MEMBER');
  });

  it('denies unauthenticated access', async () => {
    const res = await api.get(BASE(ctx.workspaceId));
    expect(res.status).toBe(401);
  });

  it('does not leak a project across workspaces (cross-workspace id reads as 404)', async () => {
    const created = await create(ctx.owner, { name: 'Isolated' });
    const otherWs = await api.post<WorkspaceSummary>(
      '/api/v1/workspaces',
      { name: 'Other Co' },
      tok(ctx.outsider),
    );
    const res = await api.get(
      `${BASE(otherWs.body.data!.id)}/${created.data!.id}`,
      tok(ctx.outsider),
    );
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('PROJECT_NOT_FOUND');
  });
});
