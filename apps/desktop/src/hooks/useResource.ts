import { useCallback, useEffect, useRef, useState } from 'react';
import type { DependencyList } from 'react';
import { errorMessage } from '../lib/bridge';

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setData: (updater: T) => void;
}

/**
 * Minimal load/reload/error state helper for IPC reads. Keeps screens free of boilerplate while
 * modeling loading, error, and empty explicitly (frontend-engineering / testing-qa). `deps` re-runs
 * the load (e.g. when the active workspace changes); the loader itself is held in a ref so an
 * inline arrow does not cause a re-fetch every render.
 */
export function useResource<T>(loader: () => Promise<T>, deps: DependencyList): Resource<T> {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loaderRef.current());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-run when the caller's dependency key changes.
  const key = JSON.stringify(deps);
  useEffect(() => {
    void reload();
  }, [key, reload]);

  return { data, loading, error, reload, setData: (next: T) => setData(next) };
}
