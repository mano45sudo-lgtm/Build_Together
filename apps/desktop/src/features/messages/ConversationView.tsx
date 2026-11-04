import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, MessageSquare, Send, Users } from 'lucide-react';
import type { ConversationSummary } from '@buildtogether/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Button, IconButton } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Spinner } from '../../components/ui/Spinner';
import { errorMessage } from '../../lib/bridge';
import { cn } from '../../lib/cn';
import { conversationKeyFor, loadHistory, sendText } from '../../lib/chat-client';
import type { ChatMessage } from '../../lib/chat-client';
import { conversationSubtitle, conversationTitle } from './conversation';
import { ConnectionBadge } from './ConnectionBadge';
import type { ChatRuntime } from './useChatRuntime';
import { dayKey, formatClock, formatDayLabel } from './time';

export interface ConversationViewProps {
  conversation: ConversationSummary | null;
  selfUserId: string;
  runtime: ChatRuntime;
  onOpenDetails: () => void;
}

const PAGE = 30;
/** Minimum gap between outgoing "typing" signals — avoids spamming the provider on every keystroke. */
const TYPING_THROTTLE_MS = 2000;

function senderName(conversation: ConversationSummary, externalId: string): string {
  const p = conversation.participants.find((x) => x.externalId === externalId);
  return p?.name ?? 'Former member';
}

/** One message bubble. Outgoing (the viewer's) aligns right; incoming shows attribution on groups. */
function MessageRow({
  message,
  showHeader,
  conversation,
  selfExternalId,
}: {
  message: ChatMessage;
  showHeader: boolean;
  conversation: ConversationSummary;
  selfExternalId: string;
}) {
  const mine = message.outgoing || message.senderExternalId === selfExternalId;
  return (
    <div className={cn('flex gap-2.5', mine ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn('w-8 shrink-0', mine && 'invisible')} aria-hidden={mine}>
        {showHeader && !mine ? (
          <Avatar name={senderName(conversation, message.senderExternalId)} size="md" />
        ) : null}
      </div>
      <div className={cn('flex max-w-[80%] flex-col', mine ? 'items-end' : 'items-start')}>
        {showHeader && !mine ? (
          <span className="mb-0.5 px-1 text-2xs text-muted">
            {senderName(conversation, message.senderExternalId)}
          </span>
        ) : null}
        <div
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm',
            mine
              ? 'bg-accent text-accent-foreground'
              : 'border border-border-subtle bg-surface-2 text-primary',
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.text || '\u00A0'}</p>
        </div>
        <span className="mt-0.5 px-1 text-2xs text-muted">{formatClock(message.sentAt)}</span>
      </div>
    </div>
  );
}

/** The right-hand chat pane: header, message stream (history + live), typing, and composer. */
export function ConversationView({
  conversation,
  selfUserId,
  runtime,
  onOpenDetails,
}: ConversationViewProps) {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const oldestRef = useRef<number>(Date.now());
  const lastTypingRef = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversationId = conversation?.id ?? null;
  const key = conversation ? conversationKeyFor(conversation) : null;
  const addressable = key !== null;

  // (Re)load the newest page of history whenever the open conversation changes or the link comes up.
  useEffect(() => {
    if (!conversation || !runtime.ready) return;
    let cancelled = false;
    setHistory([]);
    setHistoryError(null);
    setHasMore(false);
    setLoadingHistory(true);
    oldestRef.current = Date.now();
    void loadHistory(conversation, { count: PAGE })
      .then((page) => {
        if (cancelled) return;
        setHistory(page.messages);
        setHasMore(page.hasMore);
        if (page.messages.length) {
          oldestRef.current = Math.min(...page.messages.map((m) => m.sentAt));
        }
      })
      .catch((error) => {
        if (!cancelled) setHistoryError(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, runtime.ready]);

  // Mark the open thread read at the provider; clear routing focus when leaving it.
  useEffect(() => {
    if (!conversation || !runtime.ready) return;
    void runtime.openThread(conversation);
    return () => runtime.closeThread();
  }, [conversationId, runtime.ready]);

  const live = runtime.ready && key ? (runtime.extras[key] ?? []) : [];

  const messages = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of [...history, ...live]) {
      map.set(m.id || `${m.sentAt}:${m.senderExternalId}:${m.text}`, m);
    }
    return [...map.values()].sort((a, b) => a.sentAt - b.sentAt);
  }, [history, live]);

  // Keep the newest message in view as the stream grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, draft]);

  const loadEarlier = async () => {
    if (!conversation) return;
    setLoadingMore(true);
    setHistoryError(null);
    try {
      const page = await loadHistory(conversation, { count: PAGE, beforeTime: oldestRef.current });
      setHistory((prev) => {
        const merged = [...page.messages, ...prev];
        const map = new Map<string, ChatMessage>();
        for (const m of merged) map.set(m.id || `${m.sentAt}:${m.senderExternalId}:${m.text}`, m);
        return [...map.values()].sort((a, b) => a.sentAt - b.sentAt);
      });
      if (page.messages.length) {
        oldestRef.current = Math.min(oldestRef.current, ...page.messages.map((m) => m.sentAt));
      }
      setHasMore(page.hasMore);
    } catch (error) {
      setHistoryError(errorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  };

  const submit = async () => {
    if (!conversation) return;
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const sent = await sendText(conversation, text);
      runtime.pushLocal(sent);
      setDraft('');
    } catch (error) {
      setSendError(errorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (!conversation) return;
    const now = Date.now();
    if (now - lastTypingRef.current >= TYPING_THROTTLE_MS) {
      lastTypingRef.current = now;
      void runtime.noteTyping(conversation);
    }
  };

  if (!conversation) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-canvas p-8">
        <div className="w-full max-w-sm">
          <EmptyState
            icon={MessageSquare}
            title="No conversation selected"
            description="Pick a conversation to read its history and continue in real time."
          />
        </div>
      </div>
    );
  }

  const typingIds = runtime.ready && key ? (runtime.typing[key] ?? []) : [];
  const typingNames = typingIds.map((id) => senderName(conversation, id));
  const typingLabel =
    typingNames.length === 1
      ? `${typingNames[0]} is typing…`
      : typingNames.length === 2
        ? `${typingNames[0]} and ${typingNames[1]} are typing…`
        : typingNames.length > 2
          ? 'Several people are typing…'
          : null;

  const unavailable = runtime.error !== null && runtime.status === 'disconnected';
  const connecting =
    runtime.status === 'connecting' || (runtime.status === 'disconnected' && !runtime.error);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-surface-1 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {conversation.kind === 'GROUP' ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-surface-2 text-secondary">
              <Users className="size-4" aria-hidden="true" />
            </span>
          ) : (
            <Avatar
              name={
                conversation.participants.find((p) => p.userId !== selfUserId)?.name ?? 'Member'
              }
              size="md"
            />
          )}
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-primary">
              {conversationTitle(conversation, selfUserId)}
            </div>
            <div className="truncate text-xs text-muted">
              {conversationSubtitle(conversation, selfUserId)}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <ConnectionBadge status={runtime.status} error={runtime.error} />
          <Button size="sm" variant="ghost" onClick={onOpenDetails}>
            Details
          </Button>
        </div>
      </header>

      {/* Message stream */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {unavailable ? (
          <div className="mx-auto max-w-md pt-10">
            <Alert variant="error" title="Chat is currently unavailable">
              {runtime.error}
              <p className="mt-1 text-xs text-secondary">
                Conversation history and live delivery resume once the messaging service is
                reachable.
              </p>
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={() => void runtime.retry()}>
                  Try again
                </Button>
              </div>
            </Alert>
          </div>
        ) : !addressable ? (
          <div className="mx-auto max-w-md pt-10">
            <Alert variant="error" title="This conversation can’t be opened">
              It is missing the information needed to deliver messages. If this is a group, its
              channel may not have finished creating — try reopening it in a moment.
            </Alert>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {connecting ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-secondary">
                <Spinner className="size-3.5" />
                Connecting to messages…
              </div>
            ) : loadingHistory ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-2/3" />
                ))}
              </div>
            ) : (
              <>
                {historyError ? (
                  <div className="pb-2">
                    <Alert variant="error" title="Couldn’t load history">
                      {historyError}
                    </Alert>
                  </div>
                ) : null}

                {hasMore ? (
                  <div className="flex justify-center pb-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void loadEarlier()}
                      disabled={loadingMore}
                    >
                      {loadingMore ? <Spinner className="size-3.5" /> : null}
                      Load earlier messages
                    </Button>
                  </div>
                ) : null}

                {messages.length === 0 ? (
                  <div className="flex flex-col items-center gap-1.5 py-14 text-center">
                    <MessageSquare className="size-5 text-muted" aria-hidden="true" />
                    <p className="text-sm font-medium text-primary">No messages yet</p>
                    <p className="max-w-xs text-xs text-secondary">
                      Say something — this thread is connected and messages will arrive in real
                      time.
                    </p>
                  </div>
                ) : (
                  messages.map((m, i) => {
                    const prev = messages[i - 1];
                    const newDay = !prev || dayKey(prev.sentAt) !== dayKey(m.sentAt);
                    const showHeader =
                      newDay || !prev || prev.senderExternalId !== m.senderExternalId;
                    return (
                      <div key={m.id || `${m.sentAt}-${i}`}>
                        {newDay ? (
                          <div className="my-2 flex items-center gap-3">
                            <span className="h-px flex-1 bg-border-subtle" />
                            <span className="text-2xs text-muted">{formatDayLabel(m.sentAt)}</span>
                            <span className="h-px flex-1 bg-border-subtle" />
                          </div>
                        ) : null}
                        <MessageRow
                          message={m}
                          showHeader={showHeader}
                          conversation={conversation}
                          selfExternalId={runtime.myExternalId}
                        />
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Typing row + composer */}
      <div className="shrink-0 border-t border-border-subtle bg-surface-1 px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <div className="h-4" aria-live="polite">
            {typingLabel ? <p className="text-2xs text-secondary">{typingLabel}</p> : null}
          </div>
          {sendError ? (
            <p className="mb-1.5 text-2xs text-danger" role="alert">
              {sendError}
            </p>
          ) : null}
          <div
            className={cn(
              'flex items-end gap-2 rounded-lg border border-border-default bg-surface-2 p-1.5',
              (!runtime.ready || !addressable) && 'opacity-70',
            )}
          >
            <textarea
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={1}
              maxLength={4000}
              disabled={!runtime.ready || !addressable}
              placeholder={
                unavailable
                  ? 'Chat unavailable'
                  : !addressable
                    ? 'This conversation can’t receive messages'
                    : runtime.ready
                      ? 'Message'
                      : 'Connecting…'
              }
              aria-label="Message"
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-primary placeholder:text-muted focus-visible:outline-none disabled:cursor-not-allowed"
            />
            {runtime.ready ? (
              <IconButton
                aria-label="Send message"
                variant="primary"
                onClick={() => void submit()}
                disabled={!draft.trim() || sending || !addressable}
              >
                {sending ? (
                  <Spinner className="size-4" />
                ) : (
                  <Send className="size-4" aria-hidden="true" />
                )}
              </IconButton>
            ) : (
              <span className="flex size-8 items-center justify-center text-muted">
                <Lock className="size-4" aria-hidden="true" />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
