import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../lib/api";

/**
 * GET a path and expose the request as loading / error / data.
 *
 * Refetching is keyed on `path` alone: callers vary the query string (filters,
 * pagination) and get a new request for free. There is deliberately no extra
 * dependency array — spreading one into useEffect's deps made the array's
 * length vary between renders, which React does not support.
 *
 * `path === null` skips the request entirely and settles as not-loading with no
 * data. Hooks cannot be called conditionally, so this is how a caller expresses
 * "not yet" or "never" — e.g. an admin-only endpoint the current token would be
 * refused on, where firing the request only yields a 403 to hide from the user.
 *
 * Uses AbortController to cancel stale requests when the path changes or the
 * component unmounts, preventing race conditions where a slow response from a
 * previous path overwrites fresh data.
 */
export function useApi<T>(path: string | null, options?: { retryOn404?: boolean }) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useCallback(async () => {
    if (path === null) {
      setLoading(false);
      setError(null);
      setData(null);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<T>(path, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setData(result);
    } catch (e: unknown) {
      if (controller.signal.aborted) return;
      // A brand-new session is created on the server only after the WS auth
      // handshake completes, so a context-usage request fired immediately after
      // minting the session key can race ahead of session creation and get a
      // 404. Retry briefly so the gauge settles on real data instead of a
      // console error.
      if (options?.retryOn404 && e instanceof Error && e.message === "not found") {
        for (let attempt = 0; attempt < 5; attempt++) {
          await new Promise((r) => setTimeout(r, 200));
          if (controller.signal.aborted) return;
          try {
            const result = await apiFetch<T>(path, { signal: controller.signal });
            if (controller.signal.aborted) return;
            setData(result);
            setLoading(false);
            return;
          } catch (retryErr: unknown) {
            if (controller.signal.aborted) return;
            if (!(retryErr instanceof Error) || retryErr.message !== "not found") {
              setError(retryErr instanceof Error ? retryErr.message : String(retryErr));
              setLoading(false);
              return;
            }
          }
        }
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [path, options?.retryOn404]);

  useEffect(() => {
    refetch();
    return () => { abortRef.current?.abort(); };
  }, [refetch]);

  return { data, loading, error, refetch };
}
