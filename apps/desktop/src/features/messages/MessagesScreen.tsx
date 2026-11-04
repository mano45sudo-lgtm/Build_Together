import { useEffect, useMemo, useState } from 'react';
import type { ConversationSummary } from '@buildtogether/shared';
import { api } from '../../lib/data';
import { useResource } from '../../hooks/useResource';
import { useAuth } from '../../state/AuthProvider';
import { NoWorkspace } from '../workspace/NoWorkspace';
import { ConversationDetailsDialog } from './ConversationDetailsDialog';
import { ConversationList } from './ConversationList';
import { ConversationView } from './ConversationView';
import { NewConversationDialog } from './NewConversationDialog';
import { useChatRuntime } from './useChatRuntime';

/**
 * The Messages surface for the active workspace (brief §10). A workspace-scoped two-pane chat:
 * conversations on the left, the live thread on the right, with details/new as dialogs. Identity and
 * authorization are entirely server-owned — this screen only ever renders the conversations the API
 * says the caller participates in, and the realtime transport is the Web-IMLib client (ADR-0004).
 */
export function MessagesScreen() {
  const { activeWorkspace, session } = useAuth();
  if (!activeWorkspace || !session) return <NoWorkspace />;

  // Keyed by workspace id: switching workspaces fully remounts the runtime so no thread, unread
  // count, or connection focus can survive across scope (§9 workspace-switch correctness).
  return <MessagesWorkspace workspaceId={activeWorkspace.id} selfUserId={session.user.id} />;
}

function MessagesWorkspace({
  workspaceId,
  selfUserId,
}: {
  workspaceId: string;
  selfUserId: string;
}) {
  const runtime = useChatRuntime(workspaceId);
  const conversations = useResource<ConversationSummary[]>(
    () => api.chat.listConversations(workspaceId),
    [workspaceId],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const list = conversations.data ?? [];
  const selected = useMemo(() => list.find((c) => c.id === selectedId) ?? null, [list, selectedId]);

  // Keep the selection valid: auto-open the first conversation, drop a selection that has gone away
  // (e.g. after leaving it or losing workspace membership).
  useEffect(() => {
    if (selectedId && !list.some((c) => c.id === selectedId)) setSelectedId(null);
    else if (!selectedId && !conversations.loading && list.length > 0) setSelectedId(list[0]!.id);
  }, [list, selectedId, conversations.loading]);

  // Seed real unread counts from the provider once the link is up and the roster is known.
  useEffect(() => {
    if (runtime.ready && list.length > 0) void runtime.seedUnread(list);
  }, [runtime.ready, conversations.data]);

  const reloadList = () => conversations.reload();

  const onCreated = async (conversation: ConversationSummary) => {
    setNewOpen(false);
    try {
      const fresh = await api.chat.listConversations(workspaceId);
      conversations.setData(fresh);
    } catch {
      // The optimistic add still stands if the refresh fails; a later reload reconciles.
      conversations.setData([conversation, ...list]);
    }
    setSelectedId(conversation.id);
  };

  const onListRetry = () => {
    if (runtime.error) void runtime.retry();
    void conversations.reload();
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ConversationList
        conversations={list}
        loading={conversations.loading}
        error={conversations.error}
        selfUserId={selfUserId}
        selectedId={selected?.id ?? null}
        ready={runtime.ready}
        unread={runtime.unread}
        onSelect={(c) => setSelectedId(c.id)}
        onNew={() => setNewOpen(true)}
        onRetry={onListRetry}
      />

      <ConversationView
        conversation={selected}
        selfUserId={selfUserId}
        runtime={runtime}
        onOpenDetails={() => setDetailsOpen(true)}
      />

      <NewConversationDialog
        open={newOpen}
        workspaceId={workspaceId}
        selfUserId={selfUserId}
        onClose={() => setNewOpen(false)}
        onCreated={(c) => void onCreated(c)}
      />

      <ConversationDetailsDialog
        open={detailsOpen}
        conversation={selected}
        workspaceId={workspaceId}
        selfUserId={selfUserId}
        onClose={() => setDetailsOpen(false)}
        onChanged={() => void reloadList()}
      />
    </div>
  );
}
