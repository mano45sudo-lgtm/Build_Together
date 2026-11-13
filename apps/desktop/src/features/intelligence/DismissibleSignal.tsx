import { useState, type ReactNode } from 'react';
import type { DismissalState, InsightKind } from '@buildtogether/shared';
import { Button } from '../../components/ui/Button';
import { errorMessage } from '../../lib/bridge';
import { api } from '../../lib/data';

interface DismissibleSignalProps {
  workspaceId: string;
  kind: InsightKind;
  /** The engine's stable signal id (its dismissal key). */
  signalId: string;
  /** Recommendations can also be marked resolved; blockers and risks are only dismissed. */
  canResolve?: boolean;
  children: ReactNode;
}

/**
 * One computed signal with Dismiss (and optionally Resolve) plus Undo. Hiding is per user and never
 * changes the task or decision behind the signal; the server filters hidden signals on the next read.
 */
export function DismissibleSignal({
  workspaceId,
  kind,
  signalId,
  canResolve = false,
  children,
}: DismissibleSignalProps) {
  const [hidden, setHidden] = useState<DismissalState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (run: () => Promise<unknown>, next: DismissalState | null) => {
    setBusy(true);
    setError(null);
    try {
      await run();
      setHidden(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (hidden) {
    return (
      <li className="flex items-center justify-between gap-3 py-3 text-sm text-muted">
        <span>{hidden === 'RESOLVED' ? 'Marked resolved.' : 'Dismissed.'}</span>
        <Button
          variant="ghost"
          size="sm"
          loading={busy}
          onClick={() =>
            void act(() => api.intelligence.undismiss(workspaceId, kind, signalId), null)
          }
        >
          Undo
        </Button>
      </li>
    );
  }

  const hide = (state: DismissalState) =>
    act(() => api.intelligence.dismiss(workspaceId, { kind, dedupKey: signalId, state }), state);

  return (
    <li className="space-y-2 py-3">
      {children}
      <div className="flex flex-wrap items-center gap-2">
        {canResolve ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void hide('RESOLVED')}
          >
            Mark resolved
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void hide('DISMISSED')}>
          Dismiss
        </Button>
        {error ? (
          <span role="alert" className="text-2xs text-danger">
            {error}
          </span>
        ) : null}
      </div>
    </li>
  );
}
