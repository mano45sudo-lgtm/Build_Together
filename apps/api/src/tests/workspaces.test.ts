import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type {
  CreatedInvitation,
  InvitationSummary,
  IssuedSession,
  MemberSummary,
  WorkspaceSummary,
} from '@buildtogether/shared';
import { prisma } from '../lib/prisma.js';
import { PASSWORD, resetDb, TestApi } from '../test/harness.js';

const PW = PASSWORD;
const sha = (t: string): string => createHash('sha256').update(t).digest('hex');

interface Ctx {
  api: TestApi;
  owner: IssuedSession;
  admin: IssuedSession;
  member: IssuedSession;
  outsider: IssuedSession;
  workspaceId: string;
}

async function buildTeam(api: TestApi): Promise<Ctx> {
  const owner = await api.registerAs('Olivia Owner', 'olivia@example.com', PW);
  const admin = await api.registerAs('Mark Admin', 'mark@example.com', PW);
  const member = await api.registerAs('Wendy Member', 'wendy@example.com', PW);
  const outsider = await api.registerAs('Nina Outsider', 'nina@example.com', PW);

  const ws = await api.post<WorkspaceSummary>(
    '/api/v1/workspaces',
    { name: 'Acme', description: 'demo' },
    owner.tokens.accessToken,
  );
  const workspaceId = ws.body.data!.id;

  // Directly add admin + member (simulating prior accepted invites) so role tests have a full team.
  await prisma.workspaceMembership.createMany({
    data: [
      { workspaceId, userId: admin.session.user.id, role: 'ADMIN' },
      { workspaceId, userId: member.session.user.id, role: 'MEMBER' },
    ],
  });
  return { api, owner, admin, member, outsider, workspaceId };
}

/**
 * Workspace CRUD + membership + RBAC + invitation lifecycle, all against the real API. These assert
 * the brief's central promise: authorization is decided server-side, per request, from the database —
 * never from what the client claims or hides.
 */
describe('workspaces, team & invitations', () => {
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

  // ---- workspace CRUD ----

  it('creator becomes OWNER and sees the workspace in their list', async () => {
    const list = await api.get<WorkspaceSummary[]>('/api/v1/workspaces', tok(ctx.owner));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data![0]!.role).toBe('OWNER');
    expect(list.body.data![0]!.memberCount).toBe(3);
  });

  it('lists only workspaces the caller belongs to (multi-workspace isolation)', async () => {
    const other = await api.post<WorkspaceSummary>(
      '/api/v1/workspaces',
      { name: 'Other Co' },
      tok(ctx.outsider),
    );
    expect(other.status).toBe(201);
    const outsiderList = await api.get<WorkspaceSummary[]>('/api/v1/workspaces', tok(ctx.outsider));
    expect(outsiderList.body.data!.map((w) => w.id)).toEqual([other.body.data!.id]);
    expect(outsiderList.body.data!.some((w) => w.id === ctx.workspaceId)).toBe(false);
  });

  it('rejects workspace creation with an invalid name', async () => {
    const res = await api.post('/api/v1/workspaces', { name: '' }, tok(ctx.owner));
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_FAILED');
  });

  it('lets an ADMIN update workspace settings; blocks a plain MEMBER', async () => {
    const asAdmin = await api.patch<WorkspaceSummary>(
      `/api/v1/workspaces/${ctx.workspaceId}`,
      { name: 'Acme Renamed' },
      tok(ctx.admin),
    );
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.data!.name).toBe('Acme Renamed');

    const asMember = await api.patch(
      `/api/v1/workspaces/${ctx.workspaceId}`,
      { name: 'Nope' },
      tok(ctx.member),
    );
    expect(asMember.status).toBe(403);
    expect(asMember.body.error?.code).toBe('INSUFFICIENT_ROLE');
  });

  it('denies non-members access to a workspace (cross-workspace rejection)', async () => {
    const res = await api.get(`/api/v1/workspaces/${ctx.workspaceId}`, tok(ctx.outsider));
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('NOT_A_MEMBER');
  });

  // ---- members / roles ----

  it('lists members with roles (MEMBER may view the roster)', async () => {
    const res = await api.get<MemberSummary[]>(
      `/api/v1/workspaces/${ctx.workspaceId}/members`,
      tok(ctx.member),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data!.find((m) => m.role === 'OWNER')!.userId).toBe(ctx.owner.session.user.id);
  });

  it('forbids self-escalation: an ADMIN cannot promote themselves to OWNER', async () => {
    const res = await api.patch(
      `/api/v1/workspaces/${ctx.workspaceId}/members/${ctx.admin.session.user.id}`,
      { role: 'OWNER' },
      tok(ctx.admin),
    );
    // OWNER is not even an assignable value via role-change (schema 400) — never a silent promotion.
    expect(res.status).toBe(400);
  });

  it('forbids an ADMIN from changing a fellow ADMIN role (owner-only)', async () => {
    const admin2 = await api.registerAs('Sam Admin2', 'sam2@example.com', PW);
    await prisma.workspaceMembership.create({
      data: { workspaceId: ctx.workspaceId, userId: admin2.session.user.id, role: 'ADMIN' },
    });
    const res = await api.patch(
      `/api/v1/workspaces/${ctx.workspaceId}/members/${admin2.session.user.id}`,
      { role: 'MEMBER' },
      tok(ctx.admin),
    );
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('INSUFFICIENT_ROLE');
  });

  it('an ADMIN can change a plain MEMBER role', async () => {
    const res = await api.patch(
      `/api/v1/workspaces/${ctx.workspaceId}/members/${ctx.member.session.user.id}`,
      { role: 'ADMIN' },
      tok(ctx.admin),
    );
    expect(res.status).toBe(200);
    const members = await api.get<MemberSummary[]>(
      `/api/v1/workspaces/${ctx.workspaceId}/members`,
      tok(ctx.admin),
    );
    expect(members.body.data!.find((m) => m.userId === ctx.member.session.user.id)!.role).toBe(
      'ADMIN',
    );
  });

  it('the owner cannot remove themselves without transferring (must keep an owner)', async () => {
    const removeSelf = await api.del(
      `/api/v1/workspaces/${ctx.workspaceId}/members/${ctx.owner.session.user.id}`,
      tok(ctx.owner),
    );
    expect(removeSelf.status).toBe(403);
    expect(removeSelf.body.error?.code).toBe('OWNER_CANNOT_LEAVE');

    // A plain MEMBER may remove themselves (leave the workspace).
    const memberLeave = await api.del(
      `/api/v1/workspaces/${ctx.workspaceId}/members/${ctx.member.session.user.id}`,
      tok(ctx.member),
    );
    expect(memberLeave.status).toBe(200);
  });

  it('an ADMIN cannot remove the OWNER', async () => {
    const res = await api.del(
      `/api/v1/workspaces/${ctx.workspaceId}/members/${ctx.owner.session.user.id}`,
      tok(ctx.admin),
    );
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('OWNER_CANNOT_LEAVE');
  });

  it('transfers ownership (owner-only) and demotes the former owner to ADMIN', async () => {
    const res = await api.post(
      `/api/v1/workspaces/${ctx.workspaceId}/members/${ctx.member.session.user.id}/transfer`,
      undefined,
      tok(ctx.owner),
    );
    expect(res.status).toBe(200);
    const members = await api.get<MemberSummary[]>(
      `/api/v1/workspaces/${ctx.workspaceId}/members`,
      tok(ctx.owner),
    );
    expect(members.body.data!.find((m) => m.userId === ctx.member.session.user.id)!.role).toBe(
      'OWNER',
    );
    expect(members.body.data!.find((m) => m.userId === ctx.owner.session.user.id)!.role).toBe(
      'ADMIN',
    );
  });

  it('non-owners cannot transfer ownership', async () => {
    const res = await api.post(
      `/api/v1/workspaces/${ctx.workspaceId}/members/${ctx.admin.session.user.id}/transfer`,
      undefined,
      tok(ctx.admin),
    );
    expect(res.status).toBe(403);
  });

  // ---- invitations ----

  it('creates an invitation (ADMIN) and returns a dev-only invite link', async () => {
    const res = await api.post<CreatedInvitation>(
      `/api/v1/workspaces/${ctx.workspaceId}/invitations`,
      { email: 'newbie@example.com', role: 'MEMBER' },
      tok(ctx.admin),
    );
    expect(res.status).toBe(201);
    expect(res.body.data!.invitation.status).toBe('PENDING');
    // No real email transport in Phase 2 -> the link is surfaced for dev, clearly labelled.
    expect(res.body.data!.devInviteLink).toMatch(/\/invite\/accept\?token=/);
  });

  it('a plain MEMBER cannot create an invitation', async () => {
    const res = await api.post(
      `/api/v1/workspaces/${ctx.workspaceId}/invitations`,
      { email: 'nope@example.com', role: 'MEMBER' },
      tok(ctx.member),
    );
    expect(res.status).toBe(403);
  });

  it('cannot invite an OWNER (privilege escalation guard)', async () => {
    const res = await api.post(
      `/api/v1/workspaces/${ctx.workspaceId}/invitations`,
      { email: 'boss@example.com', role: 'OWNER' },
      tok(ctx.owner),
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VALIDATION_FAILED');
  });

  it('accepts an invitation with the matching email and adds the membership', async () => {
    const created = await api.post<CreatedInvitation>(
      `/api/v1/workspaces/${ctx.workspaceId}/invitations`,
      { email: 'dave@example.com', role: 'ADMIN' },
      tok(ctx.owner),
    );
    const token = extractToken(created.body.data!.devInviteLink!);

    const dave = await api.registerAs('Dave', 'dave@example.com', PW);
    const accept = await api.post<WorkspaceSummary>(
      '/api/v1/invitations/accept',
      { token },
      tok(dave),
    );
    expect(accept.status).toBe(200);
    expect(accept.body.data!.id).toBe(ctx.workspaceId);
    expect(accept.body.data!.role).toBe('ADMIN');
  });

  it('rejects accepting with a different email', async () => {
    const created = await api.post<CreatedInvitation>(
      `/api/v1/workspaces/${ctx.workspaceId}/invitations`,
      { email: 'target@example.com', role: 'MEMBER' },
      tok(ctx.owner),
    );
    const token = extractToken(created.body.data!.devInviteLink!);
    const wrong = await api.registerAs('Wrong', 'notarget@example.com', PW);
    const accept = await api.post('/api/v1/invitations/accept', { token }, tok(wrong));
    expect(accept.status).toBe(403);
    expect(accept.body.error?.code).toBe('EMAIL_MISMATCH');
  });

  it('rejects an expired invitation', async () => {
    const created = await api.post<CreatedInvitation>(
      `/api/v1/workspaces/${ctx.workspaceId}/invitations`,
      { email: 'ella@example.com', role: 'MEMBER' },
      tok(ctx.owner),
    );
    const token = extractToken(created.body.data!.devInviteLink!);
    await prisma.workspaceInvitation.update({
      where: { tokenHash: sha(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const ella = await api.registerAs('Ella', 'ella@example.com', PW);
    const accept = await api.post('/api/v1/invitations/accept', { token }, tok(ella));
    expect(accept.status).toBe(403);
    expect(accept.body.error?.code).toBe('INVITATION_EXPIRED');
  });

  it('rejects a revoked invitation', async () => {
    const created = await api.post<CreatedInvitation>(
      `/api/v1/workspaces/${ctx.workspaceId}/invitations`,
      { email: 'finn@example.com', role: 'MEMBER' },
      tok(ctx.owner),
    );
    const token = extractToken(created.body.data!.devInviteLink!);
    const revoke = await api.del(
      `/api/v1/workspaces/${ctx.workspaceId}/invitations/${created.body.data!.invitation.id}`,
      tok(ctx.owner),
    );
    expect(revoke.status).toBe(200);
    const finn = await api.registerAs('Finn', 'finn@example.com', PW);
    const accept = await api.post('/api/v1/invitations/accept', { token }, tok(finn));
    expect(accept.status).toBe(403);
    expect(accept.body.error?.code).toBe('INVITATION_REVOKED');
  });

  it('rejects an invalid token and prevents reuse of an accepted token', async () => {
    const bogus = await api.registerAs('Gus', 'gus@example.com', PW);
    const invalid = await api.post(
      '/api/v1/invitations/accept',
      { token: 'this-is-not-a-valid-invitation-token' },
      tok(bogus),
    );
    expect(invalid.status).toBe(404);

    const created = await api.post<CreatedInvitation>(
      `/api/v1/workspaces/${ctx.workspaceId}/invitations`,
      { email: 'hank@example.com', role: 'MEMBER' },
      tok(ctx.owner),
    );
    const token = extractToken(created.body.data!.devInviteLink!);
    const hank = await api.registerAs('Hank', 'hank@example.com', PW);
    const first = await api.post('/api/v1/invitations/accept', { token }, tok(hank));
    expect(first.status).toBe(200);
    const reuse = await api.post('/api/v1/invitations/accept', { token }, tok(hank));
    expect(reuse.status).toBe(400);
    expect(reuse.body.error?.code).toBe('INVITATION_ACCEPTED');
  });

  it('lists pending invitations addressed to the user', async () => {
    await api.post(
      `/api/v1/workspaces/${ctx.workspaceId}/invitations`,
      { email: 'ivy@example.com', role: 'MEMBER' },
      tok(ctx.owner),
    );
    const ivy = await api.registerAs('Ivy', 'ivy@example.com', PW);
    const pending = await api.get<InvitationSummary[]>('/api/v1/invitations/pending', tok(ivy));
    expect(pending.status).toBe(200);
    expect(pending.body.data).toHaveLength(1);
    expect(pending.body.data![0]!.email).toBe('ivy@example.com');
  });

  it('rejects unauthenticated access to a members list', async () => {
    const res = await api.get(`/api/v1/workspaces/${ctx.workspaceId}/members`);
    expect(res.status).toBe(401);
  });
});

function extractToken(link: string): string {
  const url = new URL(link);
  const token = url.searchParams.get('token');
  if (!token) throw new Error('no token in invite link');
  return token;
}
