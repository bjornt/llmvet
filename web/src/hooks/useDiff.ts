import { useState, useEffect, useCallback } from 'react';
import type { Diff } from '../types';
import { fetchDiff } from '../api';

export function useDiff(staged: boolean) {
  const [diff, setDiff] = useState<Diff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState<number>(2000);

  const load = useCallback(async () => {
    try {
      const data = await fetchDiff(staged);
      setDiff(data);
      setError(null);
      setLoading(false);
    } catch (err: unknown) {
      if (err instanceof TypeError && pollInterval > 0) {
        return;
      }
      setError(err instanceof Error ? err.message : 'unknown error');
      setLoading(false);
    }
  }, [staged, pollInterval]);

  useEffect(() => {
    if (pollInterval <= 0) return;
    const id = setInterval(load, pollInterval);
    return () => clearInterval(id);
  }, [load, pollInterval]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const stopPolling = useCallback(() => {
    setPollInterval(0);
  }, []);

  return { diff, loading, error, stopPolling };
}
