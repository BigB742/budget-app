import { useEffect, useState } from "react";

import { authFetch } from "../apiClient";

export const useInvestments = () => {
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await authFetch("/api/investments");
        if (!cancelled) {
          setInvestments(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError(err?.message || "Failed to load investments");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const refresh = () => setReloadToken((t) => t + 1);

  const addInvestment = async (payload) => {
    const created = await authFetch("/api/investments", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setInvestments((prev) => [...prev, created]);
    return created;
  };

  const contributeToInvestment = async (id, contribution) => {
    const updated = await authFetch(`/api/investments/${id}/contribute`, {
      method: "POST",
      body: JSON.stringify(contribution),
    });
    setInvestments((prev) => prev.map((inv) => (inv._id === id ? updated : inv)));
    return updated;
  };

  const deleteInvestment = async (id) => {
    await authFetch(`/api/investments/${id}`, { method: "DELETE" });
    setInvestments((prev) => prev.filter((inv) => inv._id !== id));
  };

  const updateInvestment = async (id, updates) => {
    const updated = await authFetch(`/api/investments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    setInvestments((prev) => prev.map((inv) => (inv._id === id ? updated : inv)));
    return updated;
  };

  return {
    investments,
    loading,
    error,
    refresh,
    addInvestment,
    contributeToInvestment,
    deleteInvestment,
    updateInvestment,
  };
};
