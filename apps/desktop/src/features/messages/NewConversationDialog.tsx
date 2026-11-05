import { useEffect, useMemo, useState } from 'react';
import { Check, Users } from 'lucide-react';
import type { ConversationSummary, MemberSummary } from '@buildtogether/shared';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { Alert } from '../../components/ui/Alert';
import { Skeleton } from '../../components/ui/Skeleton';
import { errorMessage } from '../../lib/bridge';
import { cn } from '../../lib/cn';
import { api } from '../../lib/data';
import { useResource } from '../../hooks/useResource';

export interface NewConversationDialogProps {
  open: boolean;
  workspaceId: string;
  selfUserId: string;
  onClose: () => void;
  onCreated: (conversation: ConversationSummary) => void;
}

type Kind = 'DIRECT' | 'GROUP';

/** Start a DIRECT (one peer) or GROUP (titled, many peers) conversation with eligible members only. */
export function NewConversationDialog({
  open,
  workspaceId,
  selfUserId,
  onClose,
  onCreated,
}: NewConversationDialogProps) {
  const [kind, setKind] = useState<Kind>('DIRECT');
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roster = useResource<MemberSummary[]>(
    () => (open ? api.members.list(workspaceId) : Promise.resolve([])),
    [open, workspaceId],
  );

  // Reset the form each time the dialog is opened.
  useEffect(() => {
    if (open) {
      setKind('DIRECT');
      setTitle('');
      setSelected([]);
      setQuery('');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const eligible = useMemo(
    () => (roster.data ?? []).filter((m) => m.userId !== selfUserId),
    [roster.data, selfUserId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter(
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [eligible, query]);

  const toggle = (userId: string) => {
    setError(null);
    if (kind === 'DIRECT') {
      setSelected((prev) => (prev[0] === userId ? [] : [userId]));
      return;
    }
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const valid = kind === 'DIRECT' ? selected.length === 1 : title.trim().length > 0;

  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.chat.createConversation(workspaceId, {
        kind,
        ...(kind === 'GROUP' ? { title: title.trim() } : {}),
        participantUserIds: selected,
      });
      onCreated(created);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

  const switchKind = (next: Kind) => {
    setKind(next);
    setSelected([]);
    setError(null);
  };

  return (
    <Dialog open={open} onClose={submitting ? () => undefined : onClose} title="New conversation">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border-default bg-surface-2 p-1">
          {(['DIRECT', 'GROUP'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => switchKind(option)}
              aria-pressed={kind === option}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors duration-150 ease-out',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                kind === option ? 'bg-surface-3 text-primary' : 'text-secondary hover:text-primary',
              )}
            >
              {option === 'GROUP' ? <Users className="size-3.5" aria-hidden="true" /> : null}
              {option === 'DIRECT' ? 'Direct message' : 'Group'}
            </button>
          ))}
        </div>

        {kind === 'GROUP' ? (
          <Field label="Group name" htmlFor="group-name" required>
            <Input
              id="group-name"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError(null);
              }}
              placeholder="e.g. Q4 Launch crew"
              maxLength={80}
            />
          </Field>
        ) : null}

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-secondary">
            {kind === 'DIRECT' ? 'Person' : 'People'}
            {kind === 'GROUP' ? <span className="ml-1 text-muted">(optional)</span> : null}
          </label>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members"
            aria-label="Search members"
            className="h-8 text-xs"
          />
        </div>

        <div className="max-h-56 min-h-24 overflow-y-auto rounded-md border border-border-subtle bg-surface-2 p-1">
          {roster.loading ? (
            <div className="space-y-1.5 p-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : roster.error ? (
            <div className="p-2">
              <Alert variant="error" title="Couldn’t load members">
                {roster.error}
              </Alert>
            </div>
          ) : eligible.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted">
              No other members to talk with yet. Invite people from Team first.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted">
              No members match your search.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((m) => {
                const checked = selected.includes(m.userId);
                return (
                  <li key={m.userId}>
                    <button
                      type="button"
                      onClick={() => toggle(m.userId)}
                      aria-pressed={checked}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-150 ease-out',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        checked ? 'bg-surface-3' : 'hover:bg-surface-3',
                      )}
                    >
                      <Avatar name={m.name} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-primary">{m.name}</span>
                        <span className="block truncate text-xs text-muted">{m.email}</span>
                      </span>
                      <span
                        className={cn(
                          'flex size-5 shrink-0 items-center justify-center rounded-full border',
                          checked
                            ? 'border-accent bg-accent text-accent-foreground'
                            : 'border-border-default',
                        )}
                        aria-hidden="true"
                      >
                        {checked ? <Check className="size-3" /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error ? (
          <Alert variant="error" title="Couldn’t start the conversation">
            {error}
          </Alert>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={submitting} disabled={!valid}>
            Create
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
