import type { ConversationParticipantView, ConversationSummary } from '@buildtogether/shared';

/**
 * Pure presentation helpers for a conversation. They derive display names from the authorized
 * participant list the backend returned (real BT users) — nothing is invented or hardcoded.
 */

/** The "other person" in a DIRECT conversation (the participant that isn't the viewer). */
export function peerOf(
  conversation: ConversationSummary,
  selfUserId: string,
): ConversationParticipantView | null {
  return conversation.participants.find((p) => p.userId !== selfUserId) ?? null;
}

/** A human title: the group name, or the DM peer's name. */
export function conversationTitle(conversation: ConversationSummary, selfUserId: string): string {
  if (conversation.kind === 'GROUP') {
    return conversation.title?.trim() || 'Group conversation';
  }
  return peerOf(conversation, selfUserId)?.name ?? 'Direct message';
}

/** Short participant subtitle for the list (who else is in a group; role-free, no fake presence). */
export function conversationSubtitle(
  conversation: ConversationSummary,
  selfUserId: string,
): string {
  const others = conversation.participants.filter((p) => p.userId !== selfUserId);
  if (conversation.kind === 'DIRECT') return 'Direct message';
  if (others.length === 0) return 'Only you';
  if (others.length === 1) return others[0]?.name ?? '1 other';
  return `${others.length} people`;
}
