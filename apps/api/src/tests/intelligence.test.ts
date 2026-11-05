import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  Blocker,
  DecisionRevisionImpact,
  IssuedSession,
  PersonalIntelligence,
  ProjectIntelligenceOverview,
  ProjectView,
  TaskView,
  WorkspaceSummary,
} from '@buildtogether/shared';
import { prisma } from '../lib/prisma.js';
import { PASSWORD, resetDb, TestApi } from '../test/harness.js';

/**
 * Phase 7 intelligence endpoints against the real API + migrated PostgreSQL. These prove the wiring
 * the pure engine tests cannot: project-visibility AUTHORIZATION (a foreign or PRIVATE project is a
 * 404, a non-member is a 403), the derived READ envelope, per-user DISMISSAL dedup (DB unique key),
 * decision-revision impact over the real Phase 6 supersede chain, and personal aggregation. The
 * endpoints can never mutate a task/decision — that is asserted structurally (no write verbs exposed).
 */

const PW = PASSWORD;
const DAY = 86_400_000;
const IN = (n: number): string => new Date(Date.now() + n * DAY).toISOString();

interface Ctx {
  api: TestApi;
  owner: IssuedSession;
  member: IssuedSession;
  otherMember: IssuedSession;
  outsider: IssuedSession;
  workspaceId: string;
}

const tok = (s: IssuedSession): string => s.tokens.accessToken;
const uid = (s: IssuedSession): string => s.session.user.id;

async function buildTeam(api: TestApi): Promise<Ctx> {
  const owner = await api.registerAs('Olivia Owner', 'olivia@example.com', PW);
  const member = await api.registerAs('Wendy Member', 'wendy@example.com', PW);
  const otherMember = await api.registerAs('Peter Member', 'peter@example.com', PW);
  const outsider = await api.registerAs('Nina Outsider', 'nina@example.com', PW);
  const ws = await api.post<WorkspaceSummary>(
    '/api/v1/workspaces',
    { name: 'Acme', description: 'demo' },
    tok(owner),
  );
  const workspaceId = ws.body.data!.id;
  await prisma.workspaceMembership.createMany({
    data: [
      { workspaceId, userId: uid(member), role: 'MEMBER' },
      { workspaceId, userId: uid(otherMember), role: 'MEMBER' },
    ],
  });
  return { api, owner, member, otherMember, outsider, workspaceId };
}

describe('intelligence endpoints', () => {
  let api: TestApi;
  let ctx: Ctx;
  const intel = (suffix: string) => `/api/v1/workspaces/${ctx.workspaceId}/intelligence${suffix}`;
  const projBase = () => `/api/v1/workspaces/${ctx.workspaceId}/projects`;

  async function createProject(
    session: IssuedSession,
    body: Record<string, unknown>,
  ): Promise<ProjectView> {
    const res = await api.post<ProjectView>(projBase(), body, tok(session));
    return res.body.data!;
  }
  async function createTask(
    session: IssuedSession,
    projectId: string,
    body: Record<string, unknown>,
  ): Promise<TaskView> {
    const res = await api.post<TaskView>(`${projBase()}/${projectId}/tasks`, body, tok(session));
    return res.body.data!;
  }

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

  it('a member gets a deterministic, explainable overview of a visible project', async () => {
    const project = await createProject(ctx.owner, { name: 'Launch' });
    await createTask(ctx.owner, project.id, { title: 'Late A', dueDate: IN(-3) });
    await createTask(ctx.owner, project.id, { title: 'Late B', dueDate: IN(-2) });
    await createTask(ctx.owner, project.id, { title: 'Late C', dueDate: IN(-1) });

    const res = await api.get<ProjectIntelligenceOverview>(
      intel(`/projects/${project.id}/overview`),
      tok(ctx.member),
    );
    expect(res.status).toBe(200);
    const data = res.body.data!;
    expect(data.project.id).toBe(project.id);
    expect(data.health.metrics.overdueTasks).toBe(3);
    expect(data.health.state).toBe('AT_RISK');
    expect(data.health.factors.length).toBeGreaterThan(0);
    expect(Array.isArray(data.blockers)).toBe(true);
    expect(Array.isArray(data.risks)).toBe(true);
    expect(Array.isArray(data.recommendations)).toBe(true);
  });

  it('rejects a non-member with 403 and a foreign/unknown project id with 404', async () => {
    const project = await createProject(ctx.owner, { name: 'Visible' });
    const denied = await api.get(intel(`/projects/${project.id}/overview`), tok(ctx.outsider));
    expect(denied.status).toBe(403);
    const missing = await api.get(
      intel('/projects/nonexistent-project-id/overview'),
      tok(ctx.member),
    );
    expect(missing.status).toBe(404);
  });

  it('treats a PRIVATE project the caller cannot see as a 404 (no existence leak)', async () => {
    const secret = await createProject(ctx.owner, { name: 'Secret', visibility: 'PRIVATE' });
    const res = await api.get(intel(`/projects/${secret.id}/overview`), tok(ctx.member));
    expect(res.status).toBe(404);
    const asOwner = await api.get<ProjectIntelligenceOverview>(
      intel(`/projects/${secret.id}/overview`),
      tok(ctx.owner),
    );
    expect(asOwner.status).toBe(200);
  });

  it('honors a per-user dismissal (dedup) and resurfaces after un-dismiss', async () => {
    const project = await createProject(ctx.owner, { name: 'Blocks' });
    const prereq = await createTask(ctx.owner, project.id, { title: 'Prereq' });
    const dependent = await createTask(ctx.owner, project.id, {
      title: 'Depends',
      dependencyIds: [prereq.id],
    });

    const before = await api.get<ProjectIntelligenceOverview>(
      intel(`/projects/${project.id}/overview`),
      tok(ctx.member),
    );
    const target = before.body.data!.blockers.find((b: Blocker) => b.taskId === dependent.id);
    expect(target).toBeTruthy();

    // Dismiss it as this member; idempotent re-dismiss must not error (DB unique key).
    const d1 = await api.post(
      intel('/dismissals'),
      { kind: 'BLOCKER', dedupKey: target!.id, state: 'DISMISSED' },
      tok(ctx.member),
    );
    expect(d1.status).toBe(201);
    const d2 = await api.post(
      intel('/dismissals'),
      { kind: 'BLOCKER', dedupKey: target!.id, state: 'DISMISSED' },
      tok(ctx.member),
    );
    expect(d2.status).toBe(201);

    const after = await api.get<ProjectIntelligenceOverview>(
      intel(`/projects/${project.id}/overview`),
      tok(ctx.member),
    );
    expect(after.body.data!.blockers.some((b: Blocker) => b.id === target!.id)).toBe(false);

    // Dismissal is per-user: another member still sees the blocker.
    const otherView = await api.get<ProjectIntelligenceOverview>(
      intel(`/projects/${project.id}/overview`),
      tok(ctx.otherMember),
    );
    expect(otherView.body.data!.blockers.some((b: Blocker) => b.id === target!.id)).toBe(true);

    // Un-dismiss resurfaces for the original member.
    const undo = await api.request('DELETE', intel('/dismissals'), {
      token: tok(ctx.member),
      body: { kind: 'BLOCKER', dedupKey: target!.id },
    });
    expect(undo.status).toBe(200);
    const resurfaced = await api.get<ProjectIntelligenceOverview>(
      intel(`/projects/${project.id}/overview`),
      tok(ctx.member),
    );
    expect(resurfaced.body.data!.blockers.some((b: Blocker) => b.id === target!.id)).toBe(true);
  });

  it('reports decision-revision impact over the real supersede chain', async () => {
    const project = await createProject(ctx.owner, { name: 'Decisions' });
    const task = await createTask(ctx.owner, project.id, { title: 'Impacted' });
    const d1 = await api.post<{ id: string }>(
      `/api/v1/workspaces/${ctx.workspaceId}/decisions`,
      {
        title: 'Old choice',
        decision: 'Adopt approach A',
        projectId: project.id,
        references: [{ type: 'TASK', label: 'Impacted', entityId: task.id }],
      },
      tok(ctx.owner),
    );
    const d2 = await api.post<{ id: string }>(
      `/api/v1/workspaces/${ctx.workspaceId}/decisions`,
      { title: 'New choice', projectId: project.id },
      tok(ctx.owner),
    );
    expect(d1.status).toBe(201);
    // A decision must be APPROVED before it can be superseded (the Phase 6 closed state machine).
    const approve = await api.post(
      `/api/v1/workspaces/${ctx.workspaceId}/decisions/${d1.body.data!.id}/approve`,
      undefined,
      tok(ctx.owner),
    );
    expect(approve.status).toBe(200);
    const sup = await api.post(
      `/api/v1/workspaces/${ctx.workspaceId}/decisions/${d1.body.data!.id}/supersede`,
      { byDecisionId: d2.body.data!.id },
      tok(ctx.owner),
    );
    expect(sup.status).toBe(200);

    const res = await api.get<DecisionRevisionImpact[]>(
      intel(`/projects/${project.id}/decision-impacts`),
      tok(ctx.member),
    );
    expect(res.status).toBe(200);
    const impact = res.body.data!.find((i) => i.decisionId === d1.body.data!.id);
    expect(impact?.affectedTasks.map((t) => t.taskId)).toContain(task.id);
    expect(impact?.supersededBy?.id).toBe(d2.body.data!.id);
  });

  it("aggregates the caller's own overdue work in personal intelligence", async () => {
    const project = await createProject(ctx.owner, { name: 'Personal' });
    const late = await createTask(ctx.member, project.id, {
      title: 'Mine late',
      assigneeId: uid(ctx.member),
      dueDate: IN(-2),
    });
    const res = await api.get<PersonalIntelligence>(intel('/personal'), tok(ctx.member));
    expect(res.status).toBe(200);
    expect(res.body.data!.userId).toBe(uid(ctx.member));
    expect(res.body.data!.overdue.map((t) => t.id)).toContain(late.id);
  });
});
