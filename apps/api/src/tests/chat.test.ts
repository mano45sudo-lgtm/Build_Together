import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  ChatToken,
  ConversationSummary,
  IssuedSession,
  WorkspaceSummary,
} from '@buildtogether/shared';
import type { ProviderMethod } from '../test/fake-provider';
import { FakeProvider } from '../test/fake-provider';
import { PASSWORD, resetDb, TestApi } from '../test/harness.js';
import { setChatProvider } from '../modules/chat/provider.js';
import { externalIdForUser } from '../modules/chat/ids.js';
import { prisma } from '../lib/prisma.js';

/**
 * Chat integration tests against the REAL API + PostgreSQL, with the Nexconn provider replaced by an
 * in-memory double (brief §12). They prove BuildTogether's OWN guarantees — secure identity mapping,
 * backend-authorized access, workspace isolation, conversation membership, and provider error mapping.
 * They do NOT (and cannot) claim the live provider works; that is credential-gated and separate.
 */

const fake = new FakeProvider();

interface Team {
  api: TestApi;
  owner: IssuedSession;
  member: IssuedSession;
  peer: IssuedSession;
  wallflower: IssuedSession; // workspace member, NOT a participant of the DMs
  outsider: IssuedSession; // not a member of the primary workspace
  workspaceId: string;
}

async function buildTeam(api: TestApi): Promise<Team> {
  const owner = await api.registerAs('Olivia Owner', 'olivia@example.com', PASSWORD);
  const member = await api.registerAs('Wendy Member', 'wendy@example.com', PASSWORD);
  const peer = await api.registerAs('Peter Peer', 'peter@example.com', PASSWORD);
  const wallflower = await api.registerAs('Wally Wallflower', 'wally@example.com', PASSWORD);
  const outsider = await api.registerAs('Nina Outsider', 'nina@example.com', PASSWORD);

  const ws = await api.post<WorkspaceSummary>(
    '/api/v1/workspaces',
    { name: 'Acme' },
    owner.tokens.accessToken,
  );
  const workspaceId = ws.body.data!.id;
  await prisma.workspaceMembership.createMany({
    data: [
      { workspaceId, userId: member.session.user.id, role: 'MEMBER' },
      { workspaceId, userId: peer.session.user.id, role: 'MEMBER' },
      { workspaceId, userId: wallflower.session.user.id, role: 'MEMBER' },
    ],
  });
  return { api, owner, member, peer, wallflower, outsider, workspaceId };
}

const tok = (s: IssuedSession): string => s.tokens.accessToken;
const uid = (s: IssuedSession): string => s.session.user.id;

function basePath(team: Team): string {
  return `/api/v1/workspaces/${team.workspaceId}`;
}

/** Clear any armed provider fault after a test that used one. */
function disarm(...methods: ProviderMethod[]): void {
  for (const m of methods) fake.disarm(m);
}

describe('chat: identity & token', () => {
  let api: TestApi;
  let team: Team;

  beforeAll(async () => {
    api = await TestApi.start();
    setChatProvider(fake);
  });
  afterAll(async () => {
    setChatProvider(null);
    await api?.stop();
  });
  beforeEach(async () => {
    await resetDb();
    fake.reset();
    team = await buildTeam(api);
  });
  afterEach(() => disarm('issueToken'));

  it('mints a short-lived, user-scoped token and persists a deterministic identity mapping', async () => {
    const res = await api.get<ChatToken>(`${basePath(team)}/chat/token`, tok(team.member));
    expect(res.status).toBe(200);
    expect(res.body.data?.token).toBe(`tok-${externalIdForUser(uid(team.member))}`);
    // The public App Key is echoed; the App Secret never is.
    expect(res.body.data?.appKey).toBe('test-app-key');
    expect(JSON.stringify(res.body)).not.toMatch(/appSecret|test-app-secret/i);
    // Identity is derived solely from the caller — stable, impersonation-proof.
    expect(res.body.data?.userId).toBe(externalIdForUser(uid(team.member)));
    expect(res.body.data?.expiresAt).toBeTruthy();

    const mapping = await prisma.nexconnUserMapping.findUnique({
      where: { userId: uid(team.member) },
    });
    expect(mapping?.externalId).toBe(`bt-${uid(team.member)}`);
    expect(fake.tokensIssued).toEqual([externalIdForUser(uid(team.member))]);
  });

  it('never lets a client mint a token for someone else (identity comes from auth, not input)', async () => {
    // Even if a client tries to smuggle another user id, the path/query is ignored; identity = caller.
    const res = await api.get<ChatToken>(
      `${basePath(team)}/chat/token?userId=${uid(team.owner)}`,
      tok(team.member),
    );
    expect(res.body.data?.userId).toBe(externalIdForUser(uid(team.member)));
  });

  it('rejects a token request from a non-member of the workspace', async () => {
    const res = await api.get(`${basePath(team)}/chat/token`, tok(team.outsider));
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('NOT_A_MEMBER');
  });

  it('fails closed with 503 when the provider reports unavailable', async () => {
    fake.arm('issueToken', 'unavailable');
    const res = await api.get(`${basePath(team)}/chat/token`, tok(team.member));
    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe('CHAT_UNAVAILABLE');
  });
});

describe('chat: conversations, authorization & isolation', () => {
  let api: TestApi;
  let team: Team;

  beforeAll(async () => {
    api = await TestApi.start();
    setChatProvider(fake);
  });
  afterAll(async () => {
    setChatProvider(null);
    await api?.stop();
  });
  beforeEach(async () => {
    await resetDb();
    fake.reset();
    team = await buildTeam(api);
  });
  afterEach(() => disarm('createGroup', 'joinGroup'));

  it('creates a GROUP, mirroring creation + joins to the provider', async () => {
    const res = await api.post<ConversationSummary>(
      `${basePath(team)}/conversations`,
      { kind: 'GROUP', title: 'Launch crew', participantUserIds: [uid(team.member)] },
      tok(team.owner),
    );
    expect(res.status).toBe(201);
    const convo = res.body.data!;
    expect(convo.kind).toBe('GROUP');
    expect(convo.providerChannelId).toMatch(/^grp[0-9a-f]{16}$/);
    expect(convo.participants.map((p) => p.userId).sort()).toEqual(
      [uid(team.owner), uid(team.member)].sort(),
    );
    expect(fake.groupsCreated).toEqual([convo.providerChannelId]);
    expect(fake.membersJoined).toEqual([externalIdForUser(uid(team.member))]);
  });

  it('rejects a GROUP without a title', async () => {
    const res = await api.post(
      `${basePath(team)}/conversations`,
      { kind: 'GROUP', title: '   ', participantUserIds: [uid(team.member)] },
      tok(team.owner),
    );
    expect(res.status).toBe(400);
  });

  it('creates a DIRECT conversation with exactly one peer', async () => {
    const res = await api.post<ConversationSummary>(
      `${basePath(team)}/conversations`,
      { kind: 'DIRECT', participantUserIds: [uid(team.peer)] },
      tok(team.member),
    );
    expect(res.status).toBe(201);
    expect(res.body.data!.kind).toBe('DIRECT');
    expect(res.body.data!.providerChannelId).toBeNull();
    // DIRECT never touches the group provider APIs.
    expect(fake.groupsCreated).toHaveLength(0);
  });

  it('rejects a DIRECT conversation with the wrong number of peers', async () => {
    const res = await api.post(
      `${basePath(team)}/conversations`,
      {
        kind: 'DIRECT',
        participantUserIds: [uid(team.peer), uid(team.wallflower)],
      },
      tok(team.member),
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('INVALID_DIRECT');
  });

  it('refuses to add a non-member as a participant and calls no provider', async () => {
    const res = await api.post(
      `${basePath(team)}/conversations`,
      { kind: 'GROUP', title: 'Nope', participantUserIds: [uid(team.outsider)] },
      tok(team.owner),
    );
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('MEMBER_REQUIRED');
    expect(fake.groupsCreated).toHaveLength(0);
    expect(await prisma.workspaceConversation.count()).toBe(0);
  });

  it('lists only the conversations the caller participates in', async () => {
    const dm = await api.post<ConversationSummary>(
      `${basePath(team)}/conversations`,
      { kind: 'DIRECT', participantUserIds: [uid(team.peer)] },
      tok(team.member),
    );
    const dmId = dm.body.data!.id;

    const memberList = await api.get<ConversationSummary[]>(
      `${basePath(team)}/conversations`,
      tok(team.member),
    );
    expect(memberList.body.data!.map((c) => c.id)).toContain(dmId);

    // A co-worker who is not in the DM must not see it, even inside the same workspace.
    const wallflowerList = await api.get<ConversationSummary[]>(
      `${basePath(team)}/conversations`,
      tok(team.wallflower),
    );
    expect(wallflowerList.body.data!.map((c) => c.id)).not.toContain(dmId);
  });

  it('blocks a non-participant (same workspace) from reading a conversation', async () => {
    const dm = await api.post<ConversationSummary>(
      `${basePath(team)}/conversations`,
      { kind: 'DIRECT', participantUserIds: [uid(team.peer)] },
      tok(team.member),
    );
    const res = await api.get(
      `${basePath(team)}/conversations/${dm.body.data!.id}`,
      tok(team.wallflower),
    );
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('NOT_A_PARTICIPANT');
  });

  it('blocks cross-workspace access by id manipulation (404, non-enumerable)', async () => {
    const dm = await api.post<ConversationSummary>(
      `${basePath(team)}/conversations`,
      { kind: 'DIRECT', participantUserIds: [uid(team.peer)] },
      tok(team.member),
    );
    const dmId = dm.body.data!.id;

    // Owner joins a SECOND workspace, then tries to read the DM through that workspace's scope.
    const other = await api.post<WorkspaceSummary>(
      '/api/v1/workspaces',
      { name: 'Other Co' },
      tok(team.member),
    );
    const otherId = other.body.data!.id;
    const res = await api.get(
      `/api/v1/workspaces/${otherId}/conversations/${dmId}`,
      tok(team.member),
    );
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('CONVERSATION_NOT_FOUND');
  });

  it('adds a workspace member to a GROUP (provider join) and refuses non-members', async () => {
    const group = await api.post<ConversationSummary>(
      `${basePath(team)}/conversations`,
      { kind: 'GROUP', title: 'Crew', participantUserIds: [uid(team.member)] },
      tok(team.owner),
    );
    const id = group.body.data!.id;

    const add = await api.post<ConversationSummary>(
      `${basePath(team)}/conversations/${id}/members`,
      { userIds: [uid(team.wallflower)] },
      tok(team.owner),
    );
    expect(add.status).toBe(200);
    expect(add.body.data!.participants.map((p) => p.userId)).toContain(uid(team.wallflower));
    expect(fake.membersJoined).toContain(externalIdForUser(uid(team.wallflower)));

    const badAdd = await api.post(
      `${basePath(team)}/conversations/${id}/members`,
      { userIds: [uid(team.outsider)] },
      tok(team.owner),
    );
    expect(badAdd.status).toBe(403);
  });

  it('does not let a DIRECT conversation gain members', async () => {
    const dm = await api.post<ConversationSummary>(
      `${basePath(team)}/conversations`,
      { kind: 'DIRECT', participantUserIds: [uid(team.peer)] },
      tok(team.member),
    );
    const res = await api.post(
      `${basePath(team)}/conversations/${dm.body.data!.id}/members`,
      { userIds: [uid(team.wallflower)] },
      tok(team.member),
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('DIRECT_FIXED');
  });

  it('enforces creator-only removal, then cuts off the removed member', async () => {
    const group = await api.post<ConversationSummary>(
      `${basePath(team)}/conversations`,
      { kind: 'GROUP', title: 'Crew', participantUserIds: [uid(team.member), uid(team.peer)] },
      tok(team.owner),
    );
    const id = group.body.data!.id;

    // A non-creator participant cannot remove someone else.
    const notCreator = await api.del(
      `${basePath(team)}/conversations/${id}/members/${uid(team.peer)}`,
      tok(team.member),
    );
    expect(notCreator.status).toBe(403);
    expect(notCreator.body.error?.code).toBe('CREATOR_ONLY');

    // The creator removes a member (provider quit + DB row dropped).
    const removed = await api.del(
      `${basePath(team)}/conversations/${id}/members/${uid(team.peer)}`,
      tok(team.owner),
    );
    expect(removed.status).toBe(200);
    expect(fake.membersLeft).toContain(externalIdForUser(uid(team.peer)));

    // The removed member no longer sees or can read the conversation.
    const afterList = await api.get<ConversationSummary[]>(
      `${basePath(team)}/conversations`,
      tok(team.peer),
    );
    expect(afterList.body.data!.map((c) => c.id)).not.toContain(id);
    const afterRead = await api.get(`${basePath(team)}/conversations/${id}`, tok(team.peer));
    expect(afterRead.status).toBe(403);
  });

  it('lets any participant leave (self-removal)', async () => {
    const group = await api.post<ConversationSummary>(
      `${basePath(team)}/conversations`,
      { kind: 'GROUP', title: 'Crew', participantUserIds: [uid(team.member)] },
      tok(team.owner),
    );
    const res = await api.del(
      `${basePath(team)}/conversations/${group.body.data!.id}/members/${uid(team.member)}`,
      tok(team.member),
    );
    expect(res.status).toBe(200);
  });

  it('maps a provider create failure to 503 and persists nothing', async () => {
    fake.arm('createGroup', 'unavailable');
    const res = await api.post(
      `${basePath(team)}/conversations`,
      { kind: 'GROUP', title: 'Crew', participantUserIds: [uid(team.member)] },
      tok(team.owner),
    );
    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe('CHAT_UNAVAILABLE');
    expect(await prisma.workspaceConversation.count()).toBe(0);
  });

  it('maps a provider bad_request to a 400 (never a raw provider error)', async () => {
    fake.arm('createGroup', 'bad_request');
    const res = await api.post(
      `${basePath(team)}/conversations`,
      { kind: 'GROUP', title: 'Crew', participantUserIds: [uid(team.member)] },
      tok(team.owner),
    );
    expect(res.status).toBe(400);
    expect(res.body.error?.message).not.toMatch(/fake provider|Nexconn|apiexception/i);
  });

  it('rejects unauthenticated access to the conversation collection', async () => {
    const res = await api.get(`${basePath(team)}/conversations`);
    expect(res.status).toBe(401);
  });
});
