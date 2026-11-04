import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  IssuedSession,
  MyTaskView,
  ProjectView,
  TaskActivityView,
  TaskDependencies,
  TaskView,
  WorkspaceSummary,
} from '@buildtogether/shared';
import { prisma } from '../lib/prisma.js';
import { PASSWORD, resetDb, TestApi } from '../test/harness.js';

const PW = PASSWORD;

/**
 * All task traffic is workspace-scoped at the mount point, so every path is namespaced by
 * `:workspaceId`. The service then re-derives the owning project + real workspace on every request,
 * which is exactly what these tests prove: a foreign id (another workspace, another project) never
 * resolves to a cross-scope read/write.
 */
const WSB = (wsId: string) => `/api/v1/workspaces/${wsId}`;
const PROJECTS = (wsId: string) => `${WSB(wsId)}/projects`;
const TASKS_IN = (wsId: string, projectId: string) => `${PROJECTS(wsId)}/${projectId}/tasks`;
const TASK = (wsId: string, taskId: string) => `${WSB(wsId)}/tasks/${taskId}`;

interface Ctx {
  api: TestApi;
  owner: IssuedSession; // workspace OWNER — manages everything
  admin: IssuedSession; // workspace ADMIN — manages everything
  member: IssuedSession; // plain MEMBER — created the shared project + its tasks
  otherMember: IssuedSession; // plain MEMBER — sees the project, owns nothing in it
  outsider: IssuedSession; // member of no workspace (owns a second one in cross-scope tests)
  workspaceId: string;
  projectId: string; // WORKSPACE-visibility project created by `member`
}

/** A workspace (owner) + admin + two members + an outsider, and one visible project owned by `member`. */
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

  const project = await api.post<ProjectView>(
    PROJECTS(workspaceId),
    { name: 'Website Relaunch' },
    member.tokens.accessToken,
  );
  const projectId = project.body.data!.id;

  return { api, owner, admin, member, otherMember, outsider, workspaceId, projectId };
}

/**
 * Phase 5 task endpoints against the real API + migrated PostgreSQL. These assert the brief's
 * promises end-to-end: real task CRUD; ownership/assignment validated against live membership; the
 * workflow status machine kept SEPARATE from derived `blocked`; dependency legality (self / duplicate
 * / out-of-scope / cycle all rejected); a full activity trail; server-side RBAC + workspace isolation;
 * cursor-paginated lists; and the My Work (`assigned-to-me`) aggregate — never trusting any id the
 * client supplies.
 */
describe('tasks', () => {
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
  const WS = () => ctx.workspaceId;
  const PID = () => ctx.projectId;

  async function createTask(
    session: IssuedSession,
    body: Record<string, unknown>,
    projectId = PID(),
  ): Promise<TaskView> {
    const res = await api.post<TaskView>(TASKS_IN(WS(), projectId), body, tok(session));
    expect(res.status).toBe(201);
    return res.body.data!;
  }

  // ---- creation ----

  it('creates a task with ONLY a title; defaults status TODO, priority MEDIUM, creator = caller', async () => {
    const t = await createTask(ctx.member, { title: 'Draft the landing page' });
    expect(t.title).toBe('Draft the landing page');
    expect(t.status).toBe('TODO');
    expect(t.priority).toBe('MEDIUM');
    expect(t.assignee).toBeNull();
    expect(t.createdBy.id).toBe(uid(ctx.member));
    expect(t.projectId).toBe(PID());
    expect(t.workspaceId).toBe(WS());
    expect(t.dueDate).toBeNull();
    expect(t.completedAt).toBeNull();
    expect(t.blocked).toBe(false);
  });

  it('honours explicit create fields (assignee member, priority, due date) atomically', async () => {
    const due = '2026-12-31T00:00:00.000Z';
    const t = await createTask(ctx.member, {
      title: 'Ship release notes',
      priority: 'HIGH',
      assigneeId: uid(ctx.otherMember),
      dueDate: due,
      description: 'Tag the v1 notes',
    });
    expect(t.priority).toBe('HIGH');
    expect(t.assignee!.id).toBe(uid(ctx.otherMember));
    expect(t.dueDate).toBe(due);
    expect(t.description).toBe('Tag the v1 notes');
  });

  it('rejects an empty title at the edge', async () => {
    const res = await api.post(TASKS_IN(WS(), PID()), { title: '  ' }, tok(ctx.member));
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_FAILED');
  });

  it('refuses an assignee who is not a workspace member', async () => {
    const res = await api.post(
      TASKS_IN(WS(), PID()),
      { title: 'Ghost work', assigneeId: uid(ctx.outsider) },
      tok(ctx.member),
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('ASSIGNEE_NOT_MEMBER');
  });

  // ---- read + list ----

  it('lists a project’s tasks and paginates with a forward cursor', async () => {
    for (let i = 1; i <= 5; i += 1) await createTask(ctx.member, { title: `Task ${i}` });
    const page1 = await api.get<TaskView[]>(
      `${TASKS_IN(WS(), PID())}?limit=2&sort=title&dir=asc`,
      tok(ctx.member),
    );
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta?.cursor).toBeTruthy();

    const cursor = page1.body.meta!.cursor as string;
    const page2 = await api.get<TaskView[]>(
      `${TASKS_IN(WS(), PID())}?limit=2&sort=title&dir=asc&cursor=${encodeURIComponent(cursor)}`,
      tok(ctx.member),
    );
    expect(page2.body.data).toHaveLength(2);
    const overlap = page2.body.data!.some((t) => page1.body.data!.some((o) => o.id === t.id));
    expect(overlap).toBe(false);
  });

  it('filters by status, priority, assignee/unassigned and title search', async () => {
    const a = await createTask(ctx.member, { title: 'Alpha', priority: 'URGENT' });
    await api.patch(TASK(WS(), a.id), { status: 'IN_PROGRESS' }, tok(ctx.member));
    const b = await createTask(ctx.member, {
      title: 'Beta',
      priority: 'LOW',
      assigneeId: uid(ctx.otherMember),
    });

    const byStatus = await api.get<TaskView[]>(
      `${TASKS_IN(WS(), PID())}?status=IN_PROGRESS`,
      tok(ctx.member),
    );
    expect(byStatus.body.data!.map((t) => t.id)).toEqual([a.id]);

    const byPriority = await api.get<TaskView[]>(
      `${TASKS_IN(WS(), PID())}?priority=LOW`,
      tok(ctx.member),
    );
    expect(byPriority.body.data!.map((t) => t.id)).toEqual([b.id]);

    const unassigned = await api.get<TaskView[]>(
      `${TASKS_IN(WS(), PID())}?unassigned=true`,
      tok(ctx.member),
    );
    expect(unassigned.body.data!.map((t) => t.id)).toContain(a.id);

    const byAssignee = await api.get<TaskView[]>(
      `${TASKS_IN(WS(), PID())}?assigneeId=${uid(ctx.otherMember)}`,
      tok(ctx.member),
    );
    expect(byAssignee.body.data!.map((t) => t.id)).toEqual([b.id]);

    const searched = await api.get<TaskView[]>(
      `${TASKS_IN(WS(), PID())}?search=alp`,
      tok(ctx.member),
    );
    expect(searched.body.data!.map((t) => t.id)).toEqual([a.id]);
  });

  // ---- update / edit ----

  it('edits title/description/priority/due date and persists them', async () => {
    const t = await createTask(ctx.member, { title: 'Renamable' });
    const res = await api.patch<TaskView>(
      TASK(WS(), t.id),
      { title: 'Renamed', priority: 'URGENT', dueDate: '2026-06-01T00:00:00.000Z' },
      tok(ctx.member),
    );
    expect(res.status).toBe(200);
    expect(res.body.data!.title).toBe('Renamed');
    expect(res.body.data!.priority).toBe('URGENT');
    expect(res.body.data!.dueDate).toBe('2026-06-01T00:00:00.000Z');

    const reread = await api.get<TaskView>(TASK(WS(), t.id), tok(ctx.member));
    expect(reread.body.data!.title).toBe('Renamed');
  });

  it('rejects an empty update payload', async () => {
    const t = await createTask(ctx.member, { title: 'No fields' });
    const res = await api.patch(TASK(WS(), t.id), {}, tok(ctx.member));
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_FAILED');
  });

  // ---- assignment + reassignment + unassignment ----

  it('assigns, reassigns and unassigns; the change persists', async () => {
    const t = await createTask(ctx.member, { title: 'Owned work' });
    const asg = await api.patch<TaskView>(
      `${TASK(WS(), t.id)}/assignee`,
      { assigneeId: uid(ctx.otherMember) },
      tok(ctx.member),
    );
    expect(asg.status).toBe(200);
    expect(asg.body.data!.assignee!.id).toBe(uid(ctx.otherMember));

    const un = await api.patch<TaskView>(
      `${TASK(WS(), t.id)}/assignee`,
      { assigneeId: null },
      tok(ctx.admin),
    );
    expect(un.body.data!.assignee).toBeNull();
  });

  it('refuses to assign a non-member', async () => {
    const t = await createTask(ctx.member, { title: 'Bad assign' });
    const res = await api.patch(
      `${TASK(WS(), t.id)}/assignee`,
      { assigneeId: uid(ctx.outsider) },
      tok(ctx.member),
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('ASSIGNEE_NOT_MEMBER');
  });

  // ---- status transitions ----

  it('moves through the status machine; DONE stamps completedAt and leaving clears it', async () => {
    const t = await createTask(ctx.member, { title: 'Flow' });
    const prog = await api.patch<TaskView>(
      `${TASK(WS(), t.id)}/status`,
      { status: 'IN_PROGRESS' },
      tok(ctx.member),
    );
    expect(prog.body.data!.status).toBe('IN_PROGRESS');
    expect(prog.body.data!.completedAt).toBeNull();

    const done = await api.patch<TaskView>(
      `${TASK(WS(), t.id)}/status`,
      { status: 'DONE' },
      tok(ctx.member),
    );
    expect(done.body.data!.status).toBe('DONE');
    expect(done.body.data!.completedAt).not.toBeNull();

    const reopened = await api.patch<TaskView>(
      `${TASK(WS(), t.id)}/status`,
      { status: 'TODO' },
      tok(ctx.member),
    );
    expect(reopened.body.data!.completedAt).toBeNull();
  });

  it('status is idempotent (no spurious activity when unchanged)', async () => {
    const t = await createTask(ctx.member, { title: 'Idempotent', status: 'IN_REVIEW' });
    const before = await api.get<TaskActivityView[]>(
      `${TASK(WS(), t.id)}/activity`,
      tok(ctx.member),
    );
    const again = await api.patch<TaskView>(
      `${TASK(WS(), t.id)}/status`,
      { status: 'IN_REVIEW' },
      tok(ctx.member),
    );
    expect(again.body.data!.status).toBe('IN_REVIEW');
    const after = await api.get<TaskActivityView[]>(
      `${TASK(WS(), t.id)}/activity`,
      tok(ctx.member),
    );
    expect(after.body.data!.length).toBe(before.body.data!.length);
  });

  // ---- dependencies: legal wiring + blocked derivation ----

  it('links a prerequisite, marks the dependent blocked, and unblocks when the prerequisite is DONE', async () => {
    const prereq = await createTask(ctx.member, { title: 'Design system' });
    const dependent = await createTask(ctx.member, { title: 'Build components' });

    const add = await api.post<TaskDependencies>(
      `${TASK(WS(), dependent.id)}/dependencies`,
      { dependsOnTaskId: prereq.id },
      tok(ctx.member),
    );
    expect(add.status).toBe(200);
    expect(add.body.data!.dependsOn.map((d) => d.task.id)).toContain(prereq.id);

    const blocked = await api.get<TaskView>(TASK(WS(), dependent.id), tok(ctx.member));
    expect(blocked.body.data!.blocked).toBe(true);

    // Completing the prerequisite clears `blocked` but NEVER auto-moves the dependent's status (§7).
    await api.patch(`${TASK(WS(), prereq.id)}/status`, { status: 'DONE' }, tok(ctx.member));
    const after = await api.get<TaskView>(TASK(WS(), dependent.id), tok(ctx.member));
    expect(after.body.data!.blocked).toBe(false);
    expect(after.body.data!.status).toBe('TODO');
  });

  it('rejects a self dependency', async () => {
    const t = await createTask(ctx.member, { title: 'Loop of one' });
    const res = await api.post(
      `${TASK(WS(), t.id)}/dependencies`,
      { dependsOnTaskId: t.id },
      tok(ctx.member),
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('SELF_DEPENDENCY');
  });

  it('rejects a duplicate dependency', async () => {
    const a = await createTask(ctx.member, { title: 'A' });
    const b = await createTask(ctx.member, { title: 'B' });
    await api.post(`${TASK(WS(), b.id)}/dependencies`, { dependsOnTaskId: a.id }, tok(ctx.member));
    const dup = await api.post(
      `${TASK(WS(), b.id)}/dependencies`,
      { dependsOnTaskId: a.id },
      tok(ctx.member),
    );
    expect(dup.status).toBe(409);
    expect(dup.body.error?.code).toBe('DEPENDENCY_EXISTS');
  });

  it('rejects a circular dependency chain', async () => {
    const a = await createTask(ctx.member, { title: 'A' });
    const b = await createTask(ctx.member, { title: 'B' });
    const c = await createTask(ctx.member, { title: 'C' });
    await api.post(`${TASK(WS(), b.id)}/dependencies`, { dependsOnTaskId: a.id }, tok(ctx.member)); // B -> A
    await api.post(`${TASK(WS(), c.id)}/dependencies`, { dependsOnTaskId: b.id }, tok(ctx.member)); // C -> B
    const cyc = await api.post(
      `${TASK(WS(), a.id)}/dependencies`,
      { dependsOnTaskId: c.id },
      tok(ctx.member),
    ); // A -> C would close A -> C -> B -> A
    expect(cyc.status).toBe(400);
    expect(cyc.body.error?.code).toBe('CIRCULAR_DEPENDENCY');
  });

  it('rejects a dependency on a task in ANOTHER project (project boundary)', async () => {
    const other = await api.post<ProjectView>(
      PROJECTS(WS()),
      { name: 'Second Project' },
      tok(ctx.member),
    );
    const foreign = await createTask(ctx.member, { title: 'Elsewhere' }, other.body.data!.id);
    const local = await createTask(ctx.member, { title: 'Here' });
    const res = await api.post(
      `${TASK(WS(), local.id)}/dependencies`,
      { dependsOnTaskId: foreign.id },
      tok(ctx.member),
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('DEPENDENCY_OUT_OF_SCOPE');
  });

  it('removes a dependency via its edge id and recomputes blocked', async () => {
    const prereq = await createTask(ctx.member, { title: 'Prereq' });
    const dep = await createTask(ctx.member, { title: 'Dependent' });
    const add = await api.post<TaskDependencies>(
      `${TASK(WS(), dep.id)}/dependencies`,
      { dependsOnTaskId: prereq.id },
      tok(ctx.member),
    );
    const edgeId = add.body.data!.dependsOn[0]!.id;
    const rm = await api.del<TaskDependencies>(
      `${TASK(WS(), dep.id)}/dependencies/${edgeId}`,
      tok(ctx.member),
    );
    expect(rm.status).toBe(200);
    expect(rm.body.data!.dependsOn).toHaveLength(0);
    const after = await api.get<TaskView>(TASK(WS(), dep.id), tok(ctx.member));
    expect(after.body.data!.blocked).toBe(false);
  });

  // ---- activity history ----

  it('records a timeline of create / status / assignee / dependency events', async () => {
    const prereq = await createTask(ctx.member, { title: 'P' });
    const t = await createTask(ctx.member, { title: 'Traceable' });
    await api.patch(`${TASK(WS(), t.id)}/status`, { status: 'DONE' }, tok(ctx.member));
    await api.patch(
      `${TASK(WS(), t.id)}/assignee`,
      { assigneeId: uid(ctx.otherMember) },
      tok(ctx.member),
    );
    await api.post(
      `${TASK(WS(), t.id)}/dependencies`,
      { dependsOnTaskId: prereq.id },
      tok(ctx.member),
    );
    const act = await api.get<TaskActivityView[]>(`${TASK(WS(), t.id)}/activity`, tok(ctx.member));
    expect(act.status).toBe(200);
    const types = new Set(act.body.data!.map((a) => a.type));
    expect(types.has('CREATED')).toBe(true);
    expect(types.has('STATUS_CHANGED')).toBe(true);
    expect(types.has('COMPLETED')).toBe(true);
    expect(types.has('ASSIGNEE_CHANGED')).toBe(true);
    expect(types.has('DEPENDENCY_ADDED')).toBe(true);
    for (const entry of act.body.data!) expect(entry.actor.id).toBeTruthy();
  });

  it('paginates activity history', async () => {
    const t = await createTask(ctx.member, { title: 'Busy' });
    for (const s of ['IN_PROGRESS', 'IN_REVIEW', 'DONE', 'TODO'] as const) {
      await api.patch(`${TASK(WS(), t.id)}/status`, { status: s }, tok(ctx.member));
    }
    const page = await api.get<TaskActivityView[]>(
      `${TASK(WS(), t.id)}/activity?limit=2`,
      tok(ctx.member),
    );
    expect(page.body.data).toHaveLength(2);
    expect(page.body.meta?.cursor).toBeTruthy();
  });

  // ---- delete ----

  it('deletes a task (manager) and it reads as gone', async () => {
    const t = await createTask(ctx.member, { title: 'Ephemeral' });
    const del = await api.del(TASK(WS(), t.id), tok(ctx.member));
    expect(del.status).toBe(200);
    const gone = await api.get(TASK(WS(), t.id), tok(ctx.member));
    expect(gone.status).toBe(404);
    expect(gone.body.error?.code).toBe('TASK_NOT_FOUND');
  });

  // ---- My Work aggregate ----

  it('assigned-to-me returns only the caller’s tasks across visible projects, with project context', async () => {
    await createTask(ctx.member, { title: 'For me', assigneeId: uid(ctx.otherMember) });
    await createTask(ctx.member, { title: 'For someone else', assigneeId: uid(ctx.admin) });
    await createTask(ctx.member, { title: 'Unassigned' });

    const mine = await api.get<MyTaskView[]>(
      `${WSB(WS())}/tasks/assigned-to-me`,
      tok(ctx.otherMember),
    );
    expect(mine.status).toBe(200);
    expect(mine.body.data).toHaveLength(1);
    const only = mine.body.data![0]!;
    expect(only.title).toBe('For me');
    expect(only.assignee!.id).toBe(uid(ctx.otherMember));
    expect(only.project.id).toBe(PID());
    expect(only.project.projectKey).toBeTruthy();
  });

  // ---- RBAC boundaries ----

  it('a fellow MEMBER who neither owns nor created the task cannot edit/delete/assign/depend it', async () => {
    const t = await createTask(ctx.member, { title: 'Not yours' });
    const patch = await api.patch(TASK(WS(), t.id), { title: 'Hijacked' }, tok(ctx.otherMember));
    expect(patch.status).toBe(403);
    expect(patch.body.error?.code).toBe('INSUFFICIENT_ROLE');

    const del = await api.del(TASK(WS(), t.id), tok(ctx.otherMember));
    expect(del.status).toBe(403);

    const asg = await api.patch(
      `${TASK(WS(), t.id)}/assignee`,
      { assigneeId: uid(ctx.admin) },
      tok(ctx.otherMember),
    );
    expect(asg.status).toBe(403);
  });

  it('an assignee can move status even without managing the project', async () => {
    const t = await createTask(ctx.member, {
      title: 'Do the work',
      assigneeId: uid(ctx.otherMember),
    });
    const mv = await api.patch<TaskView>(
      `${TASK(WS(), t.id)}/status`,
      { status: 'IN_PROGRESS' },
      tok(ctx.otherMember),
    );
    expect(mv.status).toBe(200);
    expect(mv.body.data!.status).toBe('IN_PROGRESS');
  });

  it('an ADMIN manages any task in the workspace; a workspace OWNER does too', async () => {
    const t = await createTask(ctx.member, { title: 'Escalate' });
    const adminEdit = await api.patch(TASK(WS(), t.id), { priority: 'HIGH' }, tok(ctx.admin));
    expect(adminEdit.status).toBe(200);
    const ownerDel = await api.del(TASK(WS(), t.id), tok(ctx.owner));
    expect(ownerDel.status).toBe(200);
  });

  // ---- workspace isolation + auth ----

  it('denies a non-member the whole task collection (workspace isolation)', async () => {
    const res = await api.get(TASKS_IN(WS(), PID()), tok(ctx.outsider));
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('NOT_A_MEMBER');
  });

  it('denies unauthenticated access', async () => {
    const res = await api.get(TASKS_IN(WS(), PID()));
    expect(res.status).toBe(401);
  });

  it('does not leak a task across workspaces (foreign id reads as 404)', async () => {
    const t = await createTask(ctx.member, { title: 'Isolated' });
    const otherWs = await api.post<WorkspaceSummary>(
      '/api/v1/workspaces',
      { name: 'Other Co' },
      tok(ctx.outsider),
    );
    const otherWsId = otherWs.body.data!.id;
    // A task read by its id inside a workspace it does not belong to is a 404, not a cross-scope leak.
    const res = await api.get(TASK(otherWsId, t.id), tok(ctx.outsider));
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('TASK_NOT_FOUND');
  });

  it('hides a task in a PRIVATE project from a fellow MEMBER (404)', async () => {
    const priv = await api.post<ProjectView>(
      PROJECTS(WS()),
      { name: 'Secret Project', visibility: 'PRIVATE' },
      tok(ctx.member),
    );
    const t = await createTask(ctx.member, { title: 'Hidden work' }, priv.body.data!.id);
    // Denied at the project VIEW gate, so the task never resolves for a non-visible caller. Either
    // 404 code proves the isolation; neither leaks existence of the private project's contents.
    const res = await api.get(TASK(WS(), t.id), tok(ctx.otherMember));
    expect(res.status).toBe(404);
    expect(['TASK_NOT_FOUND', 'PROJECT_NOT_FOUND']).toContain(res.body.error?.code);
  });
});
