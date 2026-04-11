import { useEffect, useState } from "react";

import { authFetch } from "../apiClient";

// Module-level cache: persists across component mounts/unmounts (tab switches).
// When the user switches tabs, the hook re-mounts but reuses this cached data
// instead of firing a new network request — eliminating redundant API calls.
let _cachedSummary = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

// Allow external callers (refreshAll, etc.) to invalidate the module cache
export const invalidateSummaryCache = () => {
  _cachedSummary = null;
  _cachedAt = 0;
};

export const useCurrentPaycheckSummary = () => {
  const isFresh = () => _cachedSummary && Date.now() - _cachedAt < CACHE_TTL_MS;

  const [summary, setSummary] = useState(isFresh() ? _cachedSummary : null);
  const [loading, setLoading] = useState(!isFresh());
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    // If cache is still fresh, return immediately without a network request
    if (isFresh() && reloadToken === 0) {
      setSummary(_cachedSummary);
      setLoading(false);
      return;
    }

    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const data = await authFetch("/api/summary/paycheck-current");
        if (isMounted) {
          // Update module-level cache
          _cachedSummary = data;
          _cachedAt = Date.now();
          setSummary(data);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err?.message || "Failed to load paycheck summary");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  const refresh = () => {
    // Bust the module cache so next load hits the network
    invalidateSummaryCache();
    setReloadToken((t) => t + 1);
  };

  return { summary, loading, error, refresh };
};
