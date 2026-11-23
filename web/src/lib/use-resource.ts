import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

/** GETs a JSON path, keeps the last good value, and reloads on demand (debounced when called in bursts). */
export function useResource<T>(path: string | null): { data: T | null; error: ApiError | null; reload: () => void; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const load = useCallback(() => {
    if (!path) return;
    const mine = ++seq.current;
    api<T>(path).then(
      (d) => {
        if (mine !== seq.current) return;
        setData(d);
        setError(null);
        setLoading(false);
      },
      (e: ApiError) => {
        if (mine !== seq.current) return;
        setError(e);
        setLoading(false);
      },
    );
  }, [path]);
  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);
  const reload = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 150);
  }, [load]);
  return { data, error, reload, loading };
}
