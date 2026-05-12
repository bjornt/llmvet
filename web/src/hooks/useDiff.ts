import { useState, useEffect, useCallback, useRef } from 'react';
import type { Diff } from '../types';
import { fetchDiff } from '../api';

export function useDiff(staged: boolean) {
  const [diff, setDiff] = useState<Diff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pollInterval, setPollInterval] = useState<number>(2000);
  const stoppedRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchDiff(staged);
      if (stoppedRef.current) return;
      setDiff(data);
      setError(null);
      setLoading(false);
    } catch (err: unknown) {
      if (stoppedRef.current) return;
      setError(err instanceof Error ? err.message : 'unknown error');
      setLoading(false);
    }
  }, [staged]);

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
    stoppedRef.current = true;
    setPollInterval(0);
  }, []);

  return { diff, loading, error, stopPolling };
}
