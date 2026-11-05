import { useEffect, useMemo, useState } from 'react';
import { Plus, UserMinus } from 'lucide-react';
import type { ConversationSummary, MemberSummary } from '@buildtogether/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button, IconButton } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Alert } from '../../components/ui/Alert';
import { Separator } from '../../components/ui/Separator';
import { Skeleton } from '../../components/ui/Skeleton';
import { errorMessage } from '../../lib/bridge';
import { api } from '../../lib/data';
import { useResource } from '../../hooks/useResource';
import { conversationTitle } from './conversation';

export interface ConversationDetailsDialogProps {
  open: boolean;
  conversation: ConversationSummary | null;
  workspaceId: string;
  selfUserId: string;
  onClose: () => void;
  onChanged: () => void;
}

/** Who is in a conversation and (for groups) how to change that — membership is server-authorized. */
export function ConversationDetailsDialog({
  open,
  conversation,
  workspaceId,
  selfUserId,
  onClose,
  onChanged,
}: ConversationDetailsDialogProps) {
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roster = useResource<MemberSummary[]>(
    () =>
      open && conversation?.kind === 'GROUP' ? api.members.list(workspaceId) : Promise.resolve([]),
    [open, workspaceId, conversation?.kind],
  );

  useEffect(() => {
    if (open) {
      setAdding(false);
      setPicked([]);
      setBusy(false);
      setError(null);
    }
  }, [open, conversation?.id]);

  const participantIds = useMemo(
    () => new Set(conversation?.participants.map((p) => p.userId) ?? []),
    [conversation],
  );

  const addable = useMemo(
    () => (roster.data ?? []).filter((m) => !participantIds.has(m.userId)),
    [roster.data, participantIds],
  );

  if (!conversation) return null;

  const isGroup = conversation.kind === 'GROUP';
  const created = new Date(conversation.createdAt);
  const createdLabel = created.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const run = async (fn: () => Promise<unknown>, afterClose = false) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
      if (afterClose) onClose();
      else {
        setAdding(false);
        setPicked([]);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const addSelected = () =>
    run(async () => {
      await api.chat.addMembers(workspaceId, conversation.id, picked);
    });

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={conversationTitle(conversation, selfUserId)}
      description={`${isGroup ? 'Group conversation' : 'Direct message'} · started ${createdLabel}`}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Participants · {conversation.participants.length}
          </h3>
          {isGroup ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAdding((v) => !v)}
              disabled={busy}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Add
            </Button>
          ) : null}
        </div>

        {isGroup && adding ? (
          <div className="rounded-md border border-border-subtle bg-surface-2 p-2">
            {roster.loading ? (
              <div className="space-y-1.5">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : addable.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted">
                Everyone in this workspace is already here.
              </p>
            ) : (
              <>
                <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                  {addable.map((m) => {
                    const checked = picked.includes(m.userId);
                    return (
                      <li key={m.userId}>
                        <button
                          type="button"
                          onClick={() =>
                            setPicked((prev) =>
                              prev.includes(m.userId)
                                ? prev.filter((id) => id !== m.userId)
                                : [...prev, m.userId],
                            )
                          }
                          aria-pressed={checked}
                          className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left ${checked ? 'bg-surface-3' : 'hover:bg-surface-3'}`}
                        >
                          <Avatar name={m.name} size="sm" />
                          <span className="min-w-0 flex-1 truncate text-sm text-primary">
                            {m.name}
                          </span>
                          {checked ? <Badge tone="accent">Selected</Badge> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAdding(false)}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void addSelected()}
                    loading={busy}
                    disabled={picked.length === 0}
                  >
                    Add {picked.length > 0 ? `(${picked.length})` : ''}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {error ? (
          <Alert variant="error" title="Couldn’t update members">
            {error}
          </Alert>
        ) : null}

        <ul className="divide-y divide-border-subtle">
          {conversation.participants.map((p) => {
            const isSelf = p.userId === selfUserId;
            return (
              <li key={p.userId} className="flex items-center gap-3 py-2">
                <Avatar name={p.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-primary">{p.name}</p>
                    {isSelf ? <span className="text-2xs text-muted">You</span> : null}
                  </div>
                </div>
                <IconButton
                  aria-label={isSelf ? 'Leave conversation' : `Remove ${p.name}`}
                  onClick={() =>
                    run(() => api.chat.removeMember(workspaceId, conversation.id, p.userId), true)
                  }
                  disabled={busy}
                  className="text-muted hover:text-danger"
                >
                  <UserMinus className="size-4" aria-hidden="true" />
                </IconButton>
              </li>
            );
          })}
        </ul>

        <Separator />
        <p className="text-2xs text-muted">
          {isGroup
            ? 'Everyone here is a member of this workspace. Only the conversation creator can remove other people; anyone can leave.'
            : 'A direct message is just the two of you. Leaving removes you from this conversation.'}
        </p>
      </div>
    </Dialog>
  );
}
