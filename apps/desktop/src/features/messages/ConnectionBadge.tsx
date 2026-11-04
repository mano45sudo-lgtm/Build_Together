import { cn } from '../../lib/cn';
import type { ConnectionState } from '../../lib/chat-client';

export interface ConnectionBadgeProps {
  status: ConnectionState;
  /** When non-null, chat is unavailable (provider unconfigured/offline) — the label switches to "Off". */
  error: string | null;
  className?: string;
}

const LABEL: Record<ConnectionState, string> = {
  connected: 'Connected',
  connecting: 'Connecting',
  disconnected: 'Offline',
};

/**
 * A truthful transport indicator. It reflects ONLY the real Nexconn connection state (or an honest
 * "Off" when the provider is unavailable) — never a decorative or optimistic flourish (§10).
 */
export function ConnectionBadge({ status, error, className }: ConnectionBadgeProps) {
  const off = error !== null && status !== 'connecting';
  const tone =
    off || status === 'disconnected' ? 'muted' : status === 'connecting' ? 'warning' : 'success';
  const text = off ? 'Off' : LABEL[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn('inline-flex items-center gap-1.5 text-2xs text-secondary', className)}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          tone === 'success' && 'bg-success',
          tone === 'warning' && 'animate-pulse bg-warning',
          tone === 'muted' && 'bg-muted',
        )}
        aria-hidden="true"
      />
      {text}
    </span>
  );
}
