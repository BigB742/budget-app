import { createContext, useCallback, useContext, useRef, useState } from "react";
import { authFetch } from "../apiClient";
import { storeUser } from "../utils/safeStorage";

const DataCacheContext = createContext(null);

export const useDataCache = () => useContext(DataCacheContext);

// How long (ms) before cached data is considered stale and re-fetched
const CACHE_TTL_MS = 60_000; // 60 seconds

export const DataCacheProvider = ({ children }) => {
  const [summary, setSummary] = useState(null);
  const [bills, setBills] = useState(null);
  const [sources, setSources] = useState(null);
  const [profile, setProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
  });

  // Track when each data type was last fetched so we can skip redundant requests
  const lastFetchedAt = useRef({ summary: 0, bills: 0, sources: 0, profile: 0 });
  const snapshotCache = useRef(new Map());

  // Returns true if the cache for the given key is still fresh
  const isFresh = (key) => Date.now() - lastFetchedAt.current[key] < CACHE_TTL_MS;

  const fetchSummary = useCallback(async (force = false) => {
    if (!force && isFresh("summary") && summary) {
      return summary;
    }
    try {
      const data = await authFetch("/api/summary/paycheck-current");
      setSummary(data);
      lastFetchedAt.current.summary = Date.now();
      return data;
    } catch { return summary; }
  }, [summary]);

  const fetchBills = useCallback(async (force = false) => {
    if (!force && isFresh("bills") && bills) {
      return bills;
    }
    try {
      const data = await authFetch("/api/bills");
      const sorted = [...(data || [])].sort((a, b) => (a.dueDayOfMonth || 0) - (b.dueDayOfMonth || 0));
      setBills(sorted);
      lastFetchedAt.current.bills = Date.now();
      return sorted;
    } catch { return bills; }
  }, [bills]);

  const fetchSources = useCallback(async (force = false) => {
    if (!force && isFresh("sources") && sources) {
      return sources;
    }
    try {
      const data = await authFetch("/api/income-sources");
      setSources(Array.isArray(data) ? data : []);
      lastFetchedAt.current.sources = Date.now();
      return data;
    } catch { return sources; }
  }, [sources]);

  const fetchProfile = useCallback(async (force = false) => {
    if (!force && isFresh("profile") && profile) {
      return profile;
    }
    try {
      const data = await authFetch("/api/user/me");
      setProfile(data);
      storeUser(data);
      lastFetchedAt.current.profile = Date.now();
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

  // Force-refresh everything and reset TTLs
  const refreshAll = useCallback(() => {
    lastFetchedAt.current = { summary: 0, bills: 0, sources: 0, profile: 0 };
    fetchSummary(true);
    fetchBills(true);
    fetchSources(true);
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
