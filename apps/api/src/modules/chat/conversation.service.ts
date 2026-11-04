import type { ConversationSummary, CreateConversationInput } from '@buildtogether/shared';
import { badRequest, forbidden, notFound } from '../../errors/app-error.js';
import { toConversationSummary } from '../../lib/view.js';
import * as workspaceRepo from '../../repositories/workspace.repo.js';
import * as repo from './chat.repo.js';
import { externalIdForUser, newProviderChannelId } from './ids.js';
import { mapProviderError } from './provider-error.js';
import { getChatProvider } from './provider.js';

/**
 * Conversation lifecycle + authorization (brief §6/§7). BuildTogether owns WHO may be in a
 * conversation and WHICH workspace it belongs to; Nexconn only carries the message stream. Every
 * rule below is enforced server-side — the client is never trusted with a conversation id, a
 * workspace id, or a participant list.
 *
 * Authorization rules implemented here:
 *  - Participants must ALL be members of the target workspace (verified freshly from the DB).
 *  - A conversation is only ever readable/mutable through its OWN workspace scope; a mismatched
 *    workspace id returns 404 (ids are not enumerable across workspaces).
 *  - Only participants may view / add / remove; only the creator may remove someone else.
 *  - DIRECT conversations are exactly two people and can never gain members.
 *  - Group membership changes are mirrored to the provider (join/quit) so transport matches authz.
 */

/** Reject a cross-workspace/missing conversation identically (404) so ids aren't enumerable. */
async function requireConversationMeta(
  conversationId: string,
  workspaceId: string,
): Promise<repo.ConversationMeta> {
  const meta = await repo.findConversationMeta(conversationId);
  if (!meta || meta.workspaceId !== workspaceId) {
    throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found');
  }
  return meta;
}

/** Throw unless every id is a current member of the workspace (server-side, fresh from the DB). */
async function assertWorkspaceMembers(workspaceId: string, userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    const role = await workspaceRepo.getRole(workspaceId, userId);
    if (!role) {
      throw forbidden('MEMBER_REQUIRED', 'Every participant must be a member of this workspace');
    }
  }
}

export async function createConversation(
  workspaceId: string,
  actorUserId: string,
  input: CreateConversationInput,
): Promise<ConversationSummary> {
  const peers = [...new Set(input.participantUserIds.filter((id) => id !== actorUserId))];
  // The actor is a member (route middleware proved it); peers must be verified too.
  await assertWorkspaceMembers(workspaceId, peers);

  if (input.kind === 'DIRECT') {
    if (peers.length !== 1) {
      throw badRequest(
        'INVALID_DIRECT',
        'A direct conversation needs exactly one other participant',
      );
    }
    const row = await repo.createConversation({
      workspaceId,
      kind: 'DIRECT',
      title: null,
      providerChannelId: null,
      createdById: actorUserId,
      userIds: [actorUserId, ...peers],
    });
    return toConversationSummary(row);
  }

  // GROUP.
  const title = input.title?.trim();
  if (!title) throw badRequest('TITLE_REQUIRED', 'A group conversation must have a title');
  const channelId = newProviderChannelId();
  const provider = getChatProvider();
  const ownerExt = externalIdForUser(actorUserId);
  const memberExts = peers.map(externalIdForUser);
  try {
    await provider.createGroup({ channelId, name: title, ownerExternalId: ownerExt });
    await provider.joinGroup({ channelId, memberExternalIds: memberExts });
  } catch (error) {
    throw mapProviderError(error);
  }

  const row = await repo.createConversation({
    workspaceId,
    kind: 'GROUP',
    title,
    providerChannelId: channelId,
    createdById: actorUserId,
    userIds: [actorUserId, ...peers],
  });
  return toConversationSummary(row);
}

export async function listConversations(
  workspaceId: string,
  userId: string,
): Promise<ConversationSummary[]> {
  const rows = await repo.listConversationsForUser(workspaceId, userId);
  return rows.map(toConversationSummary);
}

export async function getConversation(
  conversationId: string,
  workspaceId: string,
  userId: string,
): Promise<ConversationSummary> {
  await requireConversationMeta(conversationId, workspaceId);
  if (!(await repo.isParticipant(conversationId, userId))) {
    throw forbidden('NOT_A_PARTICIPANT', 'You are not a participant of this conversation');
  }
  const row = await repo.findConversation(conversationId);
  if (!row) throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found');
  return toConversationSummary(row);
}

export async function addMembers(
  conversationId: string,
  workspaceId: string,
  actorUserId: string,
  userIds: string[],
): Promise<ConversationSummary> {
  const meta = await requireConversationMeta(conversationId, workspaceId);
  if (!(await repo.isParticipant(conversationId, actorUserId))) {
    throw forbidden('NOT_A_PARTICIPANT', 'Only participants can add members');
  }
  if (meta.kind === 'DIRECT') {
    throw badRequest('DIRECT_FIXED', 'A direct conversation cannot gain members');
  }

  const existing = await repo.findConversation(conversationId);
  const current = new Set(existing?.participants.map((p) => p.userId) ?? []);
  const additions = [...new Set(userIds)].filter((id) => !current.has(id));
  if (additions.length === 0) {
    if (!existing) throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found');
    return toConversationSummary(existing);
  }
  await assertWorkspaceMembers(workspaceId, additions);

  const provider = getChatProvider();
  try {
    // Group channel id always exists for GROUP conversations.
    await provider.joinGroup({
      channelId: meta.providerChannelId as string,
      memberExternalIds: additions.map(externalIdForUser),
    });
  } catch (error) {
    throw mapProviderError(error);
  }

  const row = await repo.addParticipants(conversationId, additions);
  return toConversationSummary(row);
}

export async function removeMember(
  conversationId: string,
  workspaceId: string,
  actorUserId: string,
  targetUserId: string,
): Promise<void> {
  const meta = await requireConversationMeta(conversationId, workspaceId);
  if (!(await repo.isParticipant(conversationId, actorUserId))) {
    throw forbidden('NOT_A_PARTICIPANT', 'You are not a participant of this conversation');
  }
  // A member may always leave; removing anyone else is creator-only.
  if (targetUserId !== actorUserId && actorUserId !== meta.createdById) {
    throw forbidden('CREATOR_ONLY', 'Only the conversation creator can remove other members');
  }
  if (!(await repo.isParticipant(conversationId, targetUserId))) {
    throw notFound('PARTICIPANT_NOT_FOUND', 'That user is not in this conversation');
  }

  if (meta.kind === 'GROUP' && meta.providerChannelId) {
    const provider = getChatProvider();
    try {
      await provider.leaveGroup({
        channelId: meta.providerChannelId,
        memberExternalIds: [externalIdForUser(targetUserId)],
      });
    } catch (error) {
      throw mapProviderError(error);
    }
  }

  await repo.removeParticipant(conversationId, targetUserId);
}
