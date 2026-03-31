import { useCallback, useEffect, useState } from "react";

import { authFetch } from "../apiClient";

export const useIncomeSources = () => {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await authFetch("/api/income-sources");
      setSources(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || "Failed to load income sources");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (payload) => {
    const created = await authFetch("/api/income-sources", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setSources((prev) => [...prev, created]);
    return created;
  };

  const update = async (id, payload) => {
    const updated = await authFetch(`/api/income-sources/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    setSources((prev) => prev.map((s) => (s._id === id ? updated : s)));
    return updated;
  };

  const remove = async (id) => {
    await authFetch(`/api/income-sources/${id}`, { method: "DELETE" });
    setSources((prev) => prev.filter((s) => s._id !== id));
  };

  return { sources, loading, error, refresh: load, create, update, remove };
};
