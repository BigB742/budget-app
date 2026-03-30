import { useEffect, useState } from "react";

import { authFetch } from "../apiClient";

export const useCurrentPaycheckSummary = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const data = await authFetch("/api/summary/paycheck-current");
        if (isMounted) {
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
  }, [reloadToken]);

  const refresh = () => setReloadToken((t) => t + 1);

  return { summary, loading, error, refresh };
};
