import { useCallback, useEffect, useState } from 'react';
import { cn } from '../lib/cn';
import { fetchHealth } from '../lib/apiClient';

type Status = 'checking' | 'online' | 'offline';

function label(status: Status): string {
  return status === 'online' ? 'API online' : status === 'offline' ? 'API offline' : 'Checking…';
}

/**
 * Live connection indicator for the remote BuildTogether API. Demonstrates the secure
 * renderer -> API path and models loading / success / error states. Clicking re-checks.
 */
export function ApiStatusIndicator() {
  const [status, setStatus] = useState<Status>('checking');
  const [detail, setDetail] = useState('Checking the API connection…');

  const check = useCallback(async () => {
    setStatus('checking');
    setDetail('Checking the API connection…');
    const result = await fetchHealth();
    if (result.ok) {
      setStatus('online');
      setDetail(
        `API online — ${result.data.service}, up ${Math.round(result.data.uptimeSeconds)}s`,
      );
    } else {
      setStatus('offline');
      setDetail(`API offline — ${result.error}`);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const dot =
    status === 'online' ? 'bg-success' : status === 'offline' ? 'bg-danger' : 'bg-warning';

  return (
    <button
      type="button"
      onClick={() => void check()}
      title={detail}
      className={cn(
        'inline-flex items-center gap-2 rounded-md border border-border-subtle bg-surface-1 px-2.5 py-1 text-2xs text-secondary',
        'transition-colors duration-150 ease-out hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      )}
    >
      <span
        className={cn('size-1.5 rounded-full', dot, status === 'checking' && 'animate-pulse')}
        aria-hidden="true"
      />
      <span className="tabular-nums">{label(status)}</span>
    </button>
  );
}
