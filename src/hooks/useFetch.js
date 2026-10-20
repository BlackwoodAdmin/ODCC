import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { useInitialData } from '../ssr/initial-data';

export default function useFetch(url, deps = []) {
  const initial = useInitialData(url);
  // Consume-once contract: not StrictMode-resilient by design — in dev there
  // is never seeded data (no SSR), and prod doesn't double-invoke effects.
  const hadInitial = useRef(initial !== undefined);
  const [data, setData] = useState(initial !== undefined ? initial : null);
  const [loading, setLoading] = useState(initial === undefined);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      const result = await api.get(url);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [url, ...deps]);

  useEffect(() => {
    // The first mount after SSR already has its data — skip the duplicate fetch.
    if (hadInitial.current) { hadInitial.current = false; return; }
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
