import type { ConversationKind } from '@buildtogether/shared';
import type { ConversationParticipantRow, ConversationRow } from '../../lib/view.js';
import { prisma } from '../../lib/prisma.js';
import { externalIdForUser } from './ids.js';

/**
 * Chat persistence (the ONLY Prisma layer of the module — backend-engineering rule). Returns the
 * projection row shapes defined in `lib/view.ts`; never returns raw Prisma objects and never touches
 * the wire format. Message bodies are NEVER stored here (Nexconn owns the stream); we store only the
 * identity mapping, the workspace→conversation membership, and an idempotent callback audit.
 *
 * Provider (Nexconn) side effects are orchestrated by the SERVICES, not this layer — a DB transaction
 * must never wrap a network call.
 */

/** Select that hydrates a conversation into a `ConversationRow` (participants + their Nexconn ids). */
const conversationInclude = {
  participants: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          nexconnMapping: { select: { externalId: true } },
        },
      },
    },
  },
} as const;

type ConversationPrismaRow = {
  id: string;
  workspaceId: string;
  kind: ConversationKind;
  title: string | null;
  providerChannelId: string | null;
  createdAt: Date;
  participants: {
    user: {
      id: string;
      name: string;
      avatarUrl: string | null;
      nexconnMapping: { externalId: string } | null;
    };
  }[];
};

/** Flatten a hydrated Prisma row into the projection input. Missing mappings fall back to the
 * deterministic external id (safe: it is derived purely from the user id, never user-supplied). */
function toRow(row: ConversationPrismaRow): ConversationRow {
  const participants: ConversationParticipantRow[] = row.participants.map((p) => ({
    userId: p.user.id,
    name: p.user.name,
    avatarUrl: p.user.avatarUrl,
    externalId: p.user.nexconnMapping?.externalId ?? externalIdForUser(p.user.id),
  }));
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind,
    title: row.title,
    providerChannelId: row.providerChannelId,
    createdAt: row.createdAt,
    participants,
  };
}

/** Persist the deterministic BT→Nexconn identity mapping (DB only; the provider user is created on
 * first token mint). Idempotent — keyed on the unique userId. */
export async function ensureMapping(userId: string): Promise<string> {
  const externalId = externalIdForUser(userId);
  await prisma.nexconnUserMapping.upsert({
    where: { userId },
    create: { userId, externalId },
    update: {},
  });
  return externalId;
}

/** The caller's own mapping lookup (used by the token service before minting). */
export async function getExternalId(userId: string): Promise<string | null> {
  const m = await prisma.nexconnUserMapping.findUnique({
    where: { userId },
    select: { externalId: true },
  });
  return m ? m.externalId : null;
}

/** Ensure mappings for a batch of users (conversation participants) in one transaction. */
export async function ensureMappingsFor(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.$transaction(
    userIds.map((userId) =>
      prisma.nexconnUserMapping.upsert({
        where: { userId },
        create: { userId, externalId: externalIdForUser(userId) },
        update: {},
      }),
    ),
  );
}

/** Minimal user fields the token service needs (name + avatar) for provider registration. */
export async function getProfileForToken(
  userId: string,
): Promise<{ name: string; avatarUrl: string | null } | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, avatarUrl: true },
  });
  return u;
}

export interface CreateConversationInput {
  workspaceId: string;
  kind: ConversationKind;
  title: string | null;
  providerChannelId: string | null;
  createdById: string;
  /** Every participant id, INCLUDING the creator. */
  userIds: string[];
}

/** Create a conversation + its participant rows atomically (deduped). Mappings ensured in the same tx. */
export async function createConversation(input: CreateConversationInput): Promise<ConversationRow> {
  const uniqueIds = [...new Set(input.userIds)];
  const row = await prisma.$transaction(async (tx) => {
    for (const userId of uniqueIds) {
      await tx.nexconnUserMapping.upsert({
        where: { userId },
        create: { userId, externalId: externalIdForUser(userId) },
        update: {},
      });
    }
    const created = await tx.workspaceConversation.create({
      data: {
        workspaceId: input.workspaceId,
        kind: input.kind,
        title: input.title,
        providerChannelId: input.providerChannelId,
        createdById: input.createdById,
        participants: { create: uniqueIds.map((userId) => ({ userId })) },
      },
    });
    return tx.workspaceConversation.findUniqueOrThrow({
      where: { id: created.id },
      include: conversationInclude,
    });
  });
  return toRow(row as unknown as ConversationPrismaRow);
}

/** Internal (non-wire) conversation facts used for authorization: workspace scoping, kind, channel
 * and creator. Never returned to clients — only consulted by the service to make access decisions. */
export interface ConversationMeta {
  workspaceId: string;
  kind: ConversationKind;
  providerChannelId: string | null;
  createdById: string;
}

export async function findConversationMeta(
  conversationId: string,
): Promise<ConversationMeta | null> {
  const row = await prisma.workspaceConversation.findUnique({
    where: { id: conversationId },
    select: { workspaceId: true, kind: true, providerChannelId: true, createdById: true },
  });
  if (!row) return null;
  return {
    workspaceId: row.workspaceId,
    kind: row.kind as ConversationKind,
    providerChannelId: row.providerChannelId,
    createdById: row.createdById,
  };
}

export async function findConversation(conversationId: string): Promise<ConversationRow | null> {
  const row = await prisma.workspaceConversation.findUnique({
    where: { id: conversationId },
    include: conversationInclude,
  });
  return row ? toRow(row as unknown as ConversationPrismaRow) : null;
}

/** Conversations in `workspaceId` the user participates in (workspace + participation both enforced). */
export async function listConversationsForUser(
  workspaceId: string,
  userId: string,
): Promise<ConversationRow[]> {
  const rows = await prisma.workspaceConversation.findMany({
    where: { workspaceId, isArchived: false, participants: { some: { userId } } },
    include: conversationInclude,
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => toRow(r as unknown as ConversationPrismaRow));
}

export async function isParticipant(conversationId: string, userId: string): Promise<boolean> {
  const count = await prisma.conversationParticipant.count({
    where: { conversationId, userId },
  });
  return count > 0;
}

export async function addParticipants(
  conversationId: string,
  userIds: string[],
): Promise<ConversationRow> {
  const uniqueIds = [...new Set(userIds)];
  const row = await prisma.$transaction(async (tx) => {
    for (const userId of uniqueIds) {
      await tx.nexconnUserMapping.upsert({
        where: { userId },
        create: { userId, externalId: externalIdForUser(userId) },
        update: {},
      });
    }
    await tx.conversationParticipant.createMany({
      data: uniqueIds.map((userId) => ({ conversationId, userId })),
      skipDuplicates: true,
    });
    return tx.workspaceConversation.findUniqueOrThrow({
      where: { id: conversationId },
      include: conversationInclude,
    });
  });
  return toRow(row as unknown as ConversationPrismaRow);
}

export async function removeParticipant(conversationId: string, userId: string): Promise<void> {
  await prisma.conversationParticipant.deleteMany({ where: { conversationId, userId } });
}

/** External ids for a set of users (used to drive provider group membership). */
export async function batchExternalIds(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await prisma.nexconnUserMapping.findMany({
    where: { userId: { in: userIds } },
    select: { externalId: true },
  });
  return rows.map((r) => r.externalId);
}

/**
 * Idempotently record a verified provider callback keyed on its unique event id. Returns `true` when
 * this is a NEW event (process it) and `false` on redelivery (already seen → ignore). Never stores
 * message bodies — `payload` is a bounded audit reference only.
 */
export async function recordWebhookEvent(input: {
  providerEventId: string;
  type: string;
  payload: unknown;
}): Promise<boolean> {
  try {
    await prisma.nexconnWebhookEvent.create({
      data: {
        providerEventId: input.providerEventId,
        type: input.type,
        payload: (input.payload ?? null) as never,
      },
    });
    return true;
  } catch (error) {
    // P2002 = unique violation on providerEventId → duplicate delivery, safe to ignore.
    if ((error as { code?: string }).code === 'P2002') return false;
    throw error;
  }
}

/** Mark a recorded callback as processed (audit lifecycle). */
export async function markWebhookProcessed(providerEventId: string): Promise<void> {
  await prisma.nexconnWebhookEvent.update({
    where: { providerEventId },
    data: { status: 'PROCESSED', processedAt: new Date() },
  });
}
