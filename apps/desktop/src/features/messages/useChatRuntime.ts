import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConversationSummary } from '@buildtogether/shared';
import { errorMessage } from '../../lib/bridge';
import {
  clearUnread,
  conversationKeyFor,
  ensureConnected,
  sendTyping,
  subscribe,
  unreadCount,
} from '../../lib/chat-client';
import type { ChatMessage, ConnectionState } from '../../lib/chat-client';

/**
 * Owns the realtime side of the chat for ONE workspace: the Nexconn connection lifecycle and the
 * single global SDK subscription. Everything it exposes is real provider state — it never fabricates
 * messages, typing, or unread counts (§10 "no fakes"). When Nexconn is unconfigured/unreachable the
 * provider call rejects and this surfaces an honest error + a retry, leaving the UI in a truthful
 * "not connected" state rather than a mock conversation.
 *
 * Kept to one subscriber per mounted workspace (MessagesWorkspace is keyed by workspace id, so
 * switching workspaces remounts it and the previous thread state cannot leak across scope).
 */

/** How long a received "typing" signal stays shown before expiring (typing events are transient). */
const TYPING_TTL_MS = 4000;

export interface ChatRuntime {
  status: ConnectionState;
  statusDetail: string | null;
  /** A connection-level failure (provider unconfigured/offline). Non-null ⇒ chat is unavailable. */
  error: string | null;
  /** True only when connected and the caller's own Nexconn id is known. */
  ready: boolean;
  myExternalId: string;
  /** Live messages received per thread (keyed by `ConversationType:targetId`), beyond loaded history. */
  extras: Record<string, ChatMessage[]>;
  /** External ids currently typing, per thread. */
  typing: Record<string, string[]>;
  /** Unread counts per thread (seeded from the provider, incremented by live traffic). */
  unread: Record<string, number>;
  retry: () => Promise<void>;
  /** Merge an optimistic/acked send into its thread so it renders before the provider echo arrives. */
  pushLocal: (message: ChatMessage) => void;
  /** Mark a thread as open + read (clears its unread, routes live traffic into it silently). */
  openThread: (conversation: ConversationSummary) => Promise<void>;
  /** Close the open thread (so a re-open reseeds routing). */
  closeThread: () => void;
  /** Best-effort outgoing typing indicator, throttle-guarded by the caller. */
  noteTyping: (conversation: ConversationSummary) => Promise<void>;
  /** Seed unread counts for the listed conversations from the provider (call once when ready). */
  seedUnread: (conversations: ConversationSummary[]) => Promise<void>;
}

export function useChatRuntime(workspaceId: string): ChatRuntime {
  const [status, setStatus] = useState<ConnectionState>('disconnected');
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myExternalId, setMyExternalId] = useState('');
  const [extras, setExtras] = useState<Record<string, ChatMessage[]>>({});
  const [typing, setTyping] = useState<Record<string, string[]>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});

  // The thread currently open, so live messages to it should NOT bump its unread badge.
  const openKeyRef = useRef<string | null>(null);

  const connect = useCallback(async () => {
    setError(null);
    setStatus('connecting');
    try {
      const id = await ensureConnected(workspaceId);
      setMyExternalId(id);
      setStatus('connected');
    } catch (err) {
      setError(errorMessage(err));
      setStatus('disconnected');
    }
  }, [workspaceId]);

  // Connect on mount and whenever the workspace changes (the trusted main process re-verifies membership).
  useEffect(() => {
    void connect();
  }, [connect]);

  // One subscription for the screen's lifetime; the SDK fan-out is shared, so cleanup is a single call.
  useEffect(() => {
    const timers = new Set<number>();
    const unsubscribe = subscribe({
      onMessage: (message) => {
        setExtras((prev) => {
          const list = prev[message.conversationKey] ?? [];
          if (message.id && list.some((m) => m.id === message.id)) return prev;
          return { ...prev, [message.conversationKey]: [...list, message] };
        });
        if (!message.outgoing && message.conversationKey !== openKeyRef.current) {
          setUnread((prev) => ({
            ...prev,
            [message.conversationKey]: (prev[message.conversationKey] ?? 0) + 1,
          }));
        }
      },
      onStatus: (next, detail) => {
        setStatus(next);
        setStatusDetail(detail ?? null);
      },
      onTyping: ({ conversationKey, userExternalId }) => {
        setTyping((prev) => {
          const current = prev[conversationKey] ?? [];
          if (current.includes(userExternalId)) return prev;
          return { ...prev, [conversationKey]: [...current, userExternalId] };
        });
        const timer = window.setTimeout(() => {
          setTyping((prev) => {
            const remaining = (prev[conversationKey] ?? []).filter((u) => u !== userExternalId);
            const copy = { ...prev };
            if (remaining.length) copy[conversationKey] = remaining;
            else delete copy[conversationKey];
            return copy;
          });
        }, TYPING_TTL_MS);
        timers.add(timer);
      },
    });
    return () => {
      unsubscribe();
      for (const t of timers) window.clearTimeout(t);
    };
  }, []);

  const retry = useCallback(async () => {
    await connect();
  }, [connect]);

  const pushLocal = useCallback((message: ChatMessage) => {
    setExtras((prev) => {
      const list = prev[message.conversationKey] ?? [];
      if (message.id && list.some((m) => m.id === message.id)) return prev;
      return { ...prev, [message.conversationKey]: [...list, message] };
    });
  }, []);

  const openThread = useCallback(async (conversation: ConversationSummary) => {
    const key = conversationKeyFor(conversation);
    openKeyRef.current = key;
    if (!key) return;
    setUnread((prev) => ({ ...prev, [key]: 0 }));
    await clearUnread(conversation).catch(() => undefined);
  }, []);

  const closeThread = useCallback(() => {
    openKeyRef.current = null;
  }, []);

  const noteTyping = useCallback(async (conversation: ConversationSummary) => {
    await sendTyping(conversation).catch(() => undefined);
  }, []);

  const seedUnread = useCallback(
    async (conversations: ConversationSummary[]) => {
      if (status !== 'connected') return;
      const seeded: Record<string, number> = {};
      for (const conversation of conversations) {
        const key = conversationKeyFor(conversation);
        if (!key || key === openKeyRef.current) continue;
        const count = await unreadCount(conversation).catch(() => 0);
        if (count > 0) seeded[key] = count;
      }
      // Live-tracked threads (already in `unread`) win, so a seed can't clobber a fresher count.
      setUnread((prev) => ({ ...seeded, ...prev }));
    },
    [status],
  );

  return {
    status,
    statusDetail,
    error,
    ready: status === 'connected' && myExternalId !== '',
    myExternalId,
    extras,
    typing,
    unread,
    retry,
    pushLocal,
    openThread,
    closeThread,
    noteTyping,
    seedUnread,
  };
}
