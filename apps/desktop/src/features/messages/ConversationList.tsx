import { useMemo, useState } from 'react';
import { MessageSquare, Search, Users } from 'lucide-react';
import type { ConversationSummary } from '@buildtogether/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Skeleton } from '../../components/ui/Skeleton';
import { conversationKeyFor } from '../../lib/chat-client';
import { cn } from '../../lib/cn';
import { conversationSubtitle, conversationTitle, peerOf } from './conversation';

export interface ConversationListProps {
  conversations: ConversationSummary[];
  loading: boolean;
  error: string | null;
  selfUserId: string;
  selectedId: string | null;
  ready: boolean;
  unread: Record<string, number>;
  onSelect: (conversation: ConversationSummary) => void;
  onNew: () => void;
  onRetry: () => void;
}

function Row({
  conversation,
  selfUserId,
  selected,
  count,
  onSelect,
}: {
  conversation: ConversationSummary;
  selfUserId: string;
  selected: boolean;
  count: number;
  onSelect: (c: ConversationSummary) => void;
}) {
  const isGroup = conversation.kind === 'GROUP';
  const peer = peerOf(conversation, selfUserId);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(conversation)}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-150 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          selected ? 'bg-surface-3' : 'hover:bg-surface-2',
        )}
      >
        {isGroup ? (
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-surface-2',
              selected ? 'text-accent' : 'text-secondary',
            )}
          >
            <Users className="size-4" aria-hidden="true" />
          </span>
        ) : (
          <Avatar name={peer?.name ?? 'Unknown member'} size="md" />
        )}
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-sm',
              count > 0 ? 'font-semibold text-primary' : 'text-primary',
            )}
          >
            {conversationTitle(conversation, selfUserId)}
          </span>
          <span className="block truncate text-xs text-muted">
            {conversationSubtitle(conversation, selfUserId)}
          </span>
        </span>
        {count > 0 ? (
          <span className="ml-1 inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-2xs font-semibold text-accent-foreground">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>
    </li>
  );
}

/** Left rail of the chat: the authorized conversations for the active workspace. */
export function ConversationList({
  conversations,
  loading,
  error,
  selfUserId,
  selectedId,
  ready,
  unread,
  onSelect,
  onNew,
  onRetry,
}: ConversationListProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...conversations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!q) return sorted;
    return sorted.filter((c) => conversationTitle(c, selfUserId).toLowerCase().includes(q));
  }, [conversations, query, selfUserId]);

  const groups = filtered.filter((c) => c.kind === 'GROUP');
  const directs = filtered.filter((c) => c.kind === 'DIRECT');

  const countFor = (conversation: ConversationSummary): number => {
    if (!ready) return 0;
    const key = conversationKeyFor(conversation);
    return key ? (unread[key] ?? 0) : 0;
  };

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-border-subtle bg-surface-1">
      <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <h2 className="text-sm font-semibold text-primary">Messages</h2>
        <Button size="sm" variant="secondary" onClick={onNew}>
          New
        </Button>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            className="h-8 pl-8 text-xs"
            aria-label="Search conversations"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="space-y-1.5 px-1 pt-1">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="px-1">
            <Alert variant="error" title="Could not load conversations">
              {error}
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={onRetry}>
                  Retry
                </Button>
              </div>
            </Alert>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <MessageSquare className="size-6 text-muted" aria-hidden="true" />
            <p className="text-sm font-medium text-primary">No conversations yet</p>
            <p className="text-xs text-secondary">
              Start a direct message or a group to talk here.
            </p>
            <Button size="sm" onClick={onNew}>
              New conversation
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted">
            No conversations match “{query.trim()}”.
          </p>
        ) : (
          <div className="space-y-3">
            {groups.length > 0 ? (
              <section>
                <h3 className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted">
                  Conversations
                </h3>
                <ul className="space-y-0.5">
                  {groups.map((c) => (
                    <Row
                      key={c.id}
                      conversation={c}
                      selfUserId={selfUserId}
                      selected={c.id === selectedId}
                      count={countFor(c)}
                      onSelect={onSelect}
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            {directs.length > 0 ? (
              <section>
                <h3 className="px-2 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted">
                  Direct messages
                </h3>
                <ul className="space-y-0.5">
                  {directs.map((c) => (
                    <Row
                      key={c.id}
                      conversation={c}
                      selfUserId={selfUserId}
                      selected={c.id === selectedId}
                      count={countFor(c)}
                      onSelect={onSelect}
                    />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
