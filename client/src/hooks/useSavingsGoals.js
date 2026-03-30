import { useEffect, useState } from "react";

import { authFetch } from "../apiClient";

export const useSavingsGoals = () => {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await authFetch("/api/savings-goals");
        if (!cancelled) {
          setGoals(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError(err?.message || "Failed to load savings goals");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const reload = () => setReloadToken((t) => t + 1);

  const createGoal = async (payload) => {
    const created = await authFetch("/api/savings-goals", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setGoals((prev) => [...prev, created]);
    return created;
  };

  const updateGoal = async (id, updates) => {
    const updated = await authFetch(`/api/savings-goals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    setGoals((prev) => prev.map((g) => (g._id === id ? updated : g)));
    return updated;
  };

  const deleteGoal = async (id) => {
    await authFetch(`/api/savings-goals/${id}`, { method: "DELETE" });
    setGoals((prev) => prev.filter((g) => g._id !== id));
  };

  const contribute = async (id, amount) => {
    const updated = await authFetch(`/api/savings-goals/${id}/contribute`, {
      method: "POST",
      body: JSON.stringify({ amount }),
    });
    setGoals((prev) => prev.map((g) => (g._id === id ? updated : g)));
    return updated;
  };

  return { goals, loading, error, reload, createGoal, updateGoal, deleteGoal, contribute };
};
