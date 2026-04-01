import { createContext, useCallback, useContext, useRef, useState } from "react";
import { authFetch } from "../apiClient";

const DataCacheContext = createContext(null);

export const useDataCache = () => useContext(DataCacheContext);

export const DataCacheProvider = ({ children }) => {
  const [summary, setSummary] = useState(null);
  const [bills, setBills] = useState(null);
  const [sources, setSources] = useState(null);
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
  });

  const snapshotCache = useRef(new Map());

  const fetchSummary = useCallback(async () => {
    try {
      const data = await authFetch("/api/summary/paycheck-current");
      setSummary(data);
      return data;
    } catch { return summary; }
  }, [summary]);

  const fetchBills = useCallback(async () => {
    try {
      const data = await authFetch("/api/bills");
      const sorted = [...(data || [])].sort((a, b) => (a.dueDayOfMonth || 0) - (b.dueDayOfMonth || 0));
      setBills(sorted);
      return sorted;
    } catch { return bills; }
  }, [bills]);

  const fetchSources = useCallback(async () => {
    try {
      const data = await authFetch("/api/income-sources");
      setSources(Array.isArray(data) ? data : []);
      return data;
    } catch { return sources; }
  }, [sources]);

  const fetchProfile = useCallback(async () => {
    try {
      const data = await authFetch("/api/user/me");
      setProfile(data);
      localStorage.setItem("user", JSON.stringify(data));
      return data;
    } catch { return profile; }
  }, [profile]);

  const getSnapshot = useCallback(async (dateKey) => {
    if (snapshotCache.current.has(dateKey)) return snapshotCache.current.get(dateKey);
    try {
      const data = await authFetch(`/api/summary/projected-balance?paydayDate=${dateKey}`);
      snapshotCache.current.set(dateKey, data);
      return data;
    } catch { return null; }
  }, []);

  const invalidateSnapshots = useCallback(() => { snapshotCache.current.clear(); }, []);

  const refreshAll = useCallback(() => {
    fetchSummary();
    fetchBills();
    fetchSources();
    invalidateSnapshots();
  }, [fetchSummary, fetchBills, fetchSources, invalidateSnapshots]);

  return (
    <DataCacheContext.Provider value={{
      summary, bills, sources, profile,
      fetchSummary, fetchBills, fetchSources, fetchProfile,
      getSnapshot, invalidateSnapshots, refreshAll,
      setSummary, setBills, setSources, setProfile,
    }}>
      {children}
    </DataCacheContext.Provider>
  );
};
