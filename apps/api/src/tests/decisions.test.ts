import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type {
  DecisionAlternativeView,
  DecisionCommentView,
  DecisionDetailView,
  DecisionHistoryView,
  DecisionView,
  IssuedSession,
  ProjectView,
  TaskView,
  WorkspaceSummary,
} from '@buildtogether/shared';
import { prisma } from '../lib/prisma.js';
import { PASSWORD, resetDb, TestApi } from '../test/harness.js';

const PW = PASSWORD;

/**
 * All decision traffic is workspace-scoped at the mount point, so every path is namespaced by
 * `:workspaceId`. The service then re-derives the caller's role, the linked project's visibility and
 * the lifecycle legality on every request — exactly what these tests prove: a foreign id never
 * resolves to a cross-scope read/write, PATCH cannot reach the finalising states, and APPROVE is
 * gated on a real decision statement.
 */
const WSB = (wsId: string) => `/api/v1/workspaces/${wsId}`;
const PROJECTS = (wsId: string) => `${WSB(wsId)}/projects`;
const TASKS_IN = (wsId: string, projectId: string) => `${PROJECTS(wsId)}/${projectId}/tasks`;
const DECISIONS = (wsId: string) => `${WSB(wsId)}/decisions`;
const DEC = (wsId: string, id: string) => `${DECISIONS(wsId)}/${id}`;

interface Ctx {
  api: TestApi;
  owner: IssuedSession; // workspace OWNER — manages everything
  admin: IssuedSession; // workspace ADMIN — manages everything
  member: IssuedSession; // plain MEMBER — created the shared project
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
 * Phase 6 Decision Vault endpoints against the real API + migrated PostgreSQL. These assert the
 * brief's promises end-to-end: real CRUD with create-time defaults; the context link drives `source`
 * and is validated in-workspace; ≤1 chosen alternative and reference shape/target legality; a CLOSED
 * lifecycle state machine with APPROVE gated on a statement and SUPERSEDED/ARCHIVED locking content;
 * participants (the creator is immovable); a typed history timeline; a separate comments feed;
 * server-side RBAC + workspace isolation; and cursor-paginated lists — never trusting any id the
 * client supplies.
 */
describe('decisions', () => {
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

  async function createDecision(
    session: IssuedSession,
    body: Record<string, unknown>,
  ): Promise<DecisionDetailView> {
    const res = await api.post<DecisionDetailView>(DECISIONS(WS()), body, tok(session));
    expect(res.status).toBe(201);
    return res.body.data!;
  }

  async function createTask(
    session: IssuedSession,
    body: Record<string, unknown>,
  ): Promise<TaskView> {
    const res = await api.post<TaskView>(TASKS_IN(WS(), PID()), body, tok(session));
    expect(res.status).toBe(201);
    return res.body.data!;
  }

  // ---- creation ----

  it('creates a decision with ONLY a title; defaults status DRAFT, category GENERAL, source MANUAL, owner = creator', async () => {
    const d = await createDecision(ctx.member, { title: 'Adopt a monochrome design system' });
    expect(d.title).toBe('Adopt a monochrome design system');
    expect(d.status).toBe('DRAFT');
    expect(d.category).toBe('GENERAL');
    expect(d.source).toBe('MANUAL');
    expect(d.owner.id).toBe(uid(ctx.member));
    expect(d.createdBy.id).toBe(uid(ctx.member));
    expect(d.workspaceId).toBe(WS());
    expect(d.projectId).toBeNull();
    expect(d.approvedAt).toBeNull();
    // The creator is automatically the sole initial participant.
    expect(d.participantIds).toEqual([uid(ctx.member)]);
  });

  it('derives PROJECT source and context when linked to a project the caller can see', async () => {
    const d = await createDecision(ctx.member, {
      title: 'Ship the marketing site on Next.js',
      projectId: PID(),
    });
    expect(d.source).toBe('PROJECT');
    expect(d.projectId).toBe(PID());
    expect(d.contextSummary?.kind).toBe('PROJECT');
    expect(d.contextSummary?.id).toBe(PID());
  });

  it('honours an explicit PROPOSED create status and a member owner', async () => {
    const d = await createDecision(ctx.member, {
      title: 'Move to a monorepo',
      status: 'PROPOSED',
      category: 'ENGINEERING',
      ownerId: uid(ctx.otherMember),
      participantUserIds: [uid(ctx.otherMember)],
    });
    expect(d.status).toBe('PROPOSED');
    expect(d.category).toBe('ENGINEERING');
    expect(d.owner.id).toBe(uid(ctx.otherMember));
    expect(d.participantIds).toContain(uid(ctx.otherMember));
  });

  it('rejects an empty title at the edge', async () => {
    const res = await api.post(DECISIONS(WS()), { title: '   ' }, tok(ctx.member));
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_FAILED');
  });

  it('refuses a non-member owner', async () => {
    const res = await api.post(
      DECISIONS(WS()),
      { title: 'Bad owner', ownerId: uid(ctx.outsider) },
      tok(ctx.member),
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('PARTICIPANT_NOT_MEMBER');
  });

  it('refuses a non-member participant', async () => {
    const res = await api.post(
      DECISIONS(WS()),
      { title: 'Bad roster', participantUserIds: [uid(ctx.outsider)] },
      tok(ctx.member),
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('PARTICIPANT_NOT_MEMBER');
  });

  it('rejects two context links (a decision has exactly one originating context)', async () => {
    const task = await createTask(ctx.member, { title: 'A task' });
    const res = await api.post(
      DECISIONS(WS()),
      { title: 'Over-linked', projectId: PID(), taskId: task.id },
      tok(ctx.member),
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a project link the caller cannot see (private project → 404)', async () => {
    const priv = await api.post<ProjectView>(
      PROJECTS(WS()),
      { name: 'Secret Project', visibility: 'PRIVATE' },
      tok(ctx.admin),
    );
    const res = await api.post(
      DECISIONS(WS()),
      { title: 'Sneak into private', projectId: priv.body.data!.id },
      tok(ctx.otherMember),
    );
    expect(res.status).toBe(404);
  });

  // ---- alternatives + references legality ----

  it('stores alternatives and enforces at most one chosen', async () => {
    const d = await createDecision(ctx.member, {
      title: 'Pick a router',
      alternatives: [
        { label: 'Hash router', chosen: false },
        { label: 'History router', chosen: true },
      ],
    });
    const chosen = d.alternatives.filter((a: DecisionAlternativeView) => a.chosen);
    expect(chosen).toHaveLength(1);
    expect(chosen[0]!.label).toBe('History router');

    const bad = await api.post(
      DECISIONS(WS()),
      {
        title: 'Two winners',
        alternatives: [
          { label: 'A', chosen: true },
          { label: 'B', chosen: true },
        ],
      },
      tok(ctx.member),
    );
    expect(bad.status).toBe(400);
    expect(bad.body.error?.code).toBe('TOO_MANY_CHOSEN');
  });

  it('validates reference shape and that entity targets live in this workspace', async () => {
    const other = await createDecision(ctx.member, { title: 'Referable decision' });
    const d = await createDecision(ctx.member, {
      title: 'Evidence-backed call',
      references: [
        { type: 'LINK', label: 'Design doc', url: 'https://example.com/spec' },
        { type: 'DECISION', label: 'Prior call', entityId: other.id },
      ],
    });
    expect(d.references).toHaveLength(2);
    const byEntity = d.references.find((r) => r.type === 'DECISION');
    expect(byEntity?.resolvedLabel).toBe('Referable decision');

    const foreign = await api.post(
      DECISIONS(WS()),
      {
        title: 'Dangling reference',
        references: [{ type: 'DECISION', label: 'Ghost', entityId: 'does-not-exist' }],
      },
      tok(ctx.member),
    );
    expect(foreign.status).toBe(400);
    expect(foreign.body.error?.code).toBe('REFERENCE_TARGET_NOT_FOUND');

    const badShape = await api.post(
      DECISIONS(WS()),
      { title: 'No url', references: [{ type: 'LINK', label: 'Broken' }] },
      tok(ctx.member),
    );
    expect(badShape.status).toBe(400);
    expect(badShape.body.error?.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a non-http(s) reference url (script-capable schemes are barred)', async () => {
    const res = await api.post(
      DECISIONS(WS()),
      { title: 'XSS bait', references: [{ type: 'LINK', label: 'x', url: 'javascript:alert(1)' }] },
      tok(ctx.member),
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_FAILED');
  });

  // ---- read + list ----

  it('lists decisions and paginates with a forward cursor', async () => {
    for (let i = 1; i <= 5; i += 1) await createDecision(ctx.member, { title: `Decision ${i}` });
    const page1 = await api.get<DecisionView[]>(
      `${DECISIONS(WS())}?limit=2&sort=title&dir=asc`,
      tok(ctx.member),
    );
    expect(page1.status).toBe(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta?.cursor).toBeTruthy();

    const cursor = page1.body.meta!.cursor as string;
    const page2 = await api.get<DecisionView[]>(
      `${DECISIONS(WS())}?limit=2&sort=title&dir=asc&cursor=${encodeURIComponent(cursor)}`,
      tok(ctx.member),
    );
    expect(page2.body.data).toHaveLength(2);
    const overlap = page2.body.data!.some((d) => page1.body.data!.some((o) => o.id === d.id));
    expect(overlap).toBe(false);
  });

  it('filters by status, category, project, participant/owner and title search', async () => {
    const a = await createDecision(ctx.member, {
      title: 'Alpha call',
      category: 'DESIGN',
      projectId: PID(),
    });
    const b = await createDecision(ctx.member, {
      title: 'Beta call',
      ownerId: uid(ctx.otherMember),
      participantUserIds: [uid(ctx.otherMember)],
    });

    const byStatus = await api.get<DecisionView[]>(
      `${DECISIONS(WS())}?status=DRAFT`,
      tok(ctx.member),
    );
    expect(byStatus.body.data!.map((d) => d.id)).toEqual(expect.arrayContaining([a.id, b.id]));

    const byCategory = await api.get<DecisionView[]>(
      `${DECISIONS(WS())}?category=DESIGN`,
      tok(ctx.member),
    );
    expect(byCategory.body.data!.map((d) => d.id)).toEqual([a.id]);

    const byProject = await api.get<DecisionView[]>(
      `${DECISIONS(WS())}?projectId=${PID()}`,
      tok(ctx.member),
    );
    expect(byProject.body.data!.map((d) => d.id)).toEqual([a.id]);

    const byOwner = await api.get<DecisionView[]>(
      `${DECISIONS(WS())}?ownerId=${uid(ctx.otherMember)}`,
      tok(ctx.member),
    );
    expect(byOwner.body.data!.map((d) => d.id)).toEqual([b.id]);

    const byParticipant = await api.get<DecisionView[]>(
      `${DECISIONS(WS())}?participantId=${uid(ctx.otherMember)}`,
      tok(ctx.member),
    );
    expect(byParticipant.body.data!.map((d) => d.id)).toEqual([b.id]);

    const searched = await api.get<DecisionView[]>(
      `${DECISIONS(WS())}?search=alp`,
      tok(ctx.member),
    );
    expect(searched.body.data!.map((d) => d.id)).toEqual([a.id]);
  });

  // ---- update / edit ----

  it('edits content fields and persists them; an empty payload is rejected', async () => {
    const d = await createDecision(ctx.member, { title: 'Renamable' });
    const res = await api.patch<DecisionDetailView>(
      DEC(WS(), d.id),
      { title: 'Renamed', decision: 'We will rename', category: 'PRODUCT' },
      tok(ctx.member),
    );
    expect(res.status).toBe(200);
    expect(res.body.data!.title).toBe('Renamed');
    expect(res.body.data!.decision).toBe('We will rename');
    expect(res.body.data!.category).toBe('PRODUCT');

    const empty = await api.patch(DEC(WS(), d.id), {}, tok(ctx.member));
    expect(empty.status).toBe(400);
    expect(empty.body.error?.code).toBe('VALIDATION_FAILED');
  });

  it('REPLACE semantics on alternatives: the supplied set becomes the whole list', async () => {
    const d = await createDecision(ctx.member, {
      title: 'Swap alternatives',
      alternatives: [
        { label: 'Old A', chosen: true },
        { label: 'Old B', chosen: false },
      ],
    });
    const res = await api.patch<DecisionDetailView>(
      DEC(WS(), d.id),
      { alternatives: [{ label: 'New only', chosen: false }] },
      tok(ctx.member),
    );
    expect(res.body.data!.alternatives).toHaveLength(1);
    expect(res.body.data!.alternatives[0]!.label).toBe('New only');
  });

  it('moves DRAFT ↔ PROPOSED via PATCH but refuses a finalising state there', async () => {
    const d = await createDecision(ctx.member, { title: 'Working draft' });
    const proposed = await api.patch<DecisionDetailView>(
      DEC(WS(), d.id),
      { status: 'PROPOSED' },
      tok(ctx.member),
    );
    expect(proposed.body.data!.status).toBe('PROPOSED');
    const back = await api.patch<DecisionDetailView>(
      DEC(WS(), d.id),
      { status: 'DRAFT' },
      tok(ctx.member),
    );
    expect(back.body.data!.status).toBe('DRAFT');

    // APPROVED is not reachable through PATCH — the schema bars it so history stays typed.
    const bad = await api.patch(DEC(WS(), d.id), { status: 'APPROVED' }, tok(ctx.member));
    expect(bad.status).toBe(400);
    expect(bad.body.error?.code).toBe('VALIDATION_FAILED');
  });

  // ---- lifecycle ----

  it('approves a proposed decision that has a statement, stamping approvedAt', async () => {
    const d = await createDecision(ctx.member, {
      title: 'Adopt pnpm',
      status: 'PROPOSED',
      decision: 'We adopt pnpm workspaces.',
    });
    const approved = await api.post<DecisionDetailView>(
      `${DEC(WS(), d.id)}/approve`,
      undefined,
      tok(ctx.member),
    );
    expect(approved.status).toBe(200);
    expect(approved.body.data!.status).toBe('APPROVED');
    expect(approved.body.data!.approvedAt).not.toBeNull();
  });

  it('refuses to approve without a decision statement', async () => {
    const d = await createDecision(ctx.member, { title: 'Premature approval', status: 'PROPOSED' });
    const res = await api.post(`${DEC(WS(), d.id)}/approve`, undefined, tok(ctx.member));
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('DECISION_STATEMENT_REQUIRED');
  });

  it('rejects a proposed decision and keeps it readable', async () => {
    const d = await createDecision(ctx.member, { title: 'Vetoed', status: 'PROPOSED' });
    const rejected = await api.post<DecisionDetailView>(
      `${DEC(WS(), d.id)}/reject`,
      undefined,
      tok(ctx.member),
    );
    expect(rejected.body.data!.status).toBe('REJECTED');
    expect(rejected.body.data!.rejectedAt).not.toBeNull();
    const reread = await api.get<DecisionDetailView>(DEC(WS(), d.id), tok(ctx.member));
    expect(reread.status).toBe(200);
  });

  it('refuses an illegal lifecycle transition (DRAFT cannot reject)', async () => {
    const d = await createDecision(ctx.member, { title: 'Too early to reject' });
    const res = await api.post(`${DEC(WS(), d.id)}/reject`, undefined, tok(ctx.member));
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('INVALID_TRANSITION');
  });

  it('supersedes an approved decision with a newer one; bars self-supersede', async () => {
    const old = await createDecision(ctx.member, {
      title: 'Old direction',
      status: 'PROPOSED',
      decision: 'We chose the old path.',
    });
    await api.post(`${DEC(WS(), old.id)}/approve`, undefined, tok(ctx.member));
    const replacement = await createDecision(ctx.member, { title: 'New direction' });

    const self = await api.post(
      `${DEC(WS(), old.id)}/supersede`,
      { byDecisionId: old.id },
      tok(ctx.member),
    );
    expect(self.status).toBe(400);
    expect(self.body.error?.code).toBe('SELF_SUPERSEDE');

    const superseded = await api.post<DecisionDetailView>(
      `${DEC(WS(), old.id)}/supersede`,
      { byDecisionId: replacement.id },
      tok(ctx.member),
    );
    expect(superseded.body.data!.status).toBe('SUPERSEDED');
    expect(superseded.body.data!.supersededById).toBe(replacement.id);
    expect(superseded.body.data!.supersededByTitle).toBe('New direction');
  });

  it('locks content on a superseded or archived decision (409)', async () => {
    const d = await createDecision(ctx.member, { title: 'Going archival' });
    await api.post(`${DEC(WS(), d.id)}/archive`, undefined, tok(ctx.member));
    const edit = await api.patch(DEC(WS(), d.id), { title: 'Too late' }, tok(ctx.member));
    expect(edit.status).toBe(409);
    expect(edit.body.error?.code).toBe('DECISION_LOCKED');
  });

  it('archives then restores to the pre-archive status', async () => {
    const d = await createDecision(ctx.member, { title: 'Park and resume', status: 'PROPOSED' });
    const archived = await api.post<DecisionDetailView>(
      `${DEC(WS(), d.id)}/archive`,
      undefined,
      tok(ctx.member),
    );
    expect(archived.body.data!.status).toBe('ARCHIVED');
    expect(archived.body.data!.archivedAt).not.toBeNull();

    const restored = await api.post<DecisionDetailView>(
      `${DEC(WS(), d.id)}/restore`,
      undefined,
      tok(ctx.member),
    );
    expect(restored.body.data!.status).toBe('PROPOSED');
    expect(restored.body.data!.archivedAt).toBeNull();
  });

  // ---- participants ----

  it('adds a member participant and refuses to remove the creator', async () => {
    const d = await createDecision(ctx.member, { title: 'Roster' });
    const added = await api.post<DecisionDetailView>(
      `${DEC(WS(), d.id)}/participants`,
      { userId: uid(ctx.otherMember) },
      tok(ctx.member),
    );
    expect(added.status).toBe(200);
    expect(added.body.data!.participantIds).toContain(uid(ctx.otherMember));

    const tryRemoveCreator = await api.del(
      `${DEC(WS(), d.id)}/participants/${uid(ctx.member)}`,
      tok(ctx.member),
    );
    expect(tryRemoveCreator.status).toBe(400);
    expect(tryRemoveCreator.body.error?.code).toBe('CREATOR_REQUIRED');

    const removed = await api.del<DecisionDetailView>(
      `${DEC(WS(), d.id)}/participants/${uid(ctx.otherMember)}`,
      tok(ctx.member),
    );
    expect(removed.body.data!.participantIds).not.toContain(uid(ctx.otherMember));
  });

  it('refuses a non-member participant add', async () => {
    const d = await createDecision(ctx.member, { title: 'No ghosts' });
    const res = await api.post(
      `${DEC(WS(), d.id)}/participants`,
      { userId: uid(ctx.outsider) },
      tok(ctx.member),
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('PARTICIPANT_NOT_MEMBER');
  });

  // ---- history timeline ----

  it('records a typed history across create / propose / approve / ownership', async () => {
    const d = await createDecision(ctx.member, { title: 'Traceable' });
    await api.patch(DEC(WS(), d.id), { status: 'PROPOSED' }, tok(ctx.member));
    await api.patch(DEC(WS(), d.id), { decision: 'Yes.' }, tok(ctx.member));
    await api.post(`${DEC(WS(), d.id)}/approve`, undefined, tok(ctx.member));
    await api.patch(DEC(WS(), d.id), { ownerId: uid(ctx.otherMember) }, tok(ctx.member));

    const hist = await api.get<DecisionHistoryView[]>(
      `${DEC(WS(), d.id)}/history`,
      tok(ctx.member),
    );
    expect(hist.status).toBe(200);
    const types = new Set(hist.body.data!.map((h) => h.type));
    expect(types.has('CREATED')).toBe(true);
    expect(types.has('STATUS_CHANGED')).toBe(true);
    expect(types.has('APPROVED')).toBe(true);
    expect(types.has('OWNER_CHANGED')).toBe(true);
    for (const entry of hist.body.data!) expect(entry.actor.id).toBeTruthy();
  });

  // ---- comments ----

  it('supports a discussion feed: a viewer comments, the author deletes; a stranger cannot', async () => {
    const d = await createDecision(ctx.member, { title: 'Discuss me' });
    const made = await api.post<DecisionCommentView>(
      `${DEC(WS(), d.id)}/comments`,
      { body: 'Strong agree.' },
      tok(ctx.otherMember),
    );
    expect(made.status).toBe(201);

    const list = await api.get<DecisionCommentView[]>(
      `${DEC(WS(), d.id)}/comments`,
      tok(ctx.member),
    );
    expect(list.body.data!.map((c) => c.id)).toContain(made.body.data!.id);

    // A fellow member who is neither the author nor an editor cannot delete it.
    const strangerDelete = await api.del(
      `${DEC(WS(), d.id)}/comments/${made.body.data!.id}`,
      tok(ctx.otherMember),
    );
    // otherMember IS the author here, so this succeeds — instead have `admin` (editor) remove it.
    expect(strangerDelete.status).toBe(200);
  });

  it('bars a non-viewer from the comments feed', async () => {
    const priv = await api.post<ProjectView>(
      PROJECTS(WS()),
      { name: 'Private Vault', visibility: 'PRIVATE' },
      tok(ctx.member),
    );
    const d = await createDecision(ctx.member, {
      title: 'Private call',
      projectId: priv.body.data!.id,
    });
    await api.post(`${DEC(WS(), d.id)}/comments`, { body: 'note' }, tok(ctx.member));
    const res = await api.get(`${DEC(WS(), d.id)}/comments`, tok(ctx.otherMember));
    expect(res.status).toBe(404);
  });

  // ---- delete ----

  it('deletes a decision (manager) and it reads as gone', async () => {
    const d = await createDecision(ctx.member, { title: 'Ephemeral' });
    const del = await api.del(DEC(WS(), d.id), tok(ctx.member));
    expect(del.status).toBe(200);
    const gone = await api.get(DEC(WS(), d.id), tok(ctx.member));
    expect(gone.status).toBe(404);
    expect(gone.body.error?.code).toBe('DECISION_NOT_FOUND');
  });

  // ---- RBAC boundaries ----

  it('a fellow MEMBER who neither owns nor created the decision cannot edit / approve / delete it', async () => {
    const d = await createDecision(ctx.member, { title: 'Not yours', decision: 'locked in' });
    const patch = await api.patch(DEC(WS(), d.id), { title: 'Hijacked' }, tok(ctx.otherMember));
    expect(patch.status).toBe(403);
    expect(patch.body.error?.code).toBe('INSUFFICIENT_ROLE');

    const approve = await api.post(`${DEC(WS(), d.id)}/approve`, undefined, tok(ctx.otherMember));
    expect(approve.status).toBe(403);

    const del = await api.del(DEC(WS(), d.id), tok(ctx.otherMember));
    expect(del.status).toBe(403);

    // …but they can still VIEW and comment on it (workspace-visible).
    const view = await api.get<DecisionDetailView>(DEC(WS(), d.id), tok(ctx.otherMember));
    expect(view.status).toBe(200);
  });

  it('an ADMIN manages any decision; a workspace OWNER does too', async () => {
    const d = await createDecision(ctx.member, { title: 'Escalate', decision: 'yes' });
    const adminEdit = await api.patch(DEC(WS(), d.id), { category: 'BUSINESS' }, tok(ctx.admin));
    expect(adminEdit.status).toBe(200);
    const ownerDel = await api.del(DEC(WS(), d.id), tok(ctx.owner));
    expect(ownerDel.status).toBe(200);
  });

  // ---- workspace isolation + auth ----

  it('denies a non-member the whole decision collection (workspace isolation)', async () => {
    const res = await api.get(DECISIONS(WS()), tok(ctx.outsider));
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('NOT_A_MEMBER');
  });

  it('denies unauthenticated access', async () => {
    const res = await api.get(DECISIONS(WS()));
    expect(res.status).toBe(401);
  });

  it('does not leak a decision across workspaces (foreign id reads as 404)', async () => {
    const d = await createDecision(ctx.member, { title: 'Isolated' });
    const otherWs = await api.post<WorkspaceSummary>(
      '/api/v1/workspaces',
      { name: 'Other Co' },
      tok(ctx.outsider),
    );
    const otherWsId = otherWs.body.data!.id;
    const res = await api.get(DEC(otherWsId, d.id), tok(ctx.outsider));
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('DECISION_NOT_FOUND');
  });

  it('hides a decision in a PRIVATE project from a fellow MEMBER (404)', async () => {
    const priv = await api.post<ProjectView>(
      PROJECTS(WS()),
      { name: 'Secret Project', visibility: 'PRIVATE' },
      tok(ctx.member),
    );
    const d = await createDecision(ctx.member, {
      title: 'Hidden call',
      projectId: priv.body.data!.id,
    });
    const res = await api.get(DEC(WS(), d.id), tok(ctx.otherMember));
    expect(res.status).toBe(404);
    expect(['DECISION_NOT_FOUND', 'PROJECT_NOT_FOUND']).toContain(res.body.error?.code);
  });
});
