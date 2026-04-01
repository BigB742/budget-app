import { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { authFetch } from "../apiClient";

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  const location = useLocation();
  const isOnboarding = location.pathname === "/onboarding";

  // Start with cached user from localStorage so the page doesn't blank
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
  });
  const [loading, setLoading] = useState(!user && !!token);
  const [authFailed, setAuthFailed] = useState(false);
  const didFetch = useRef(false);

  useEffect(() => {
    if (!token || didFetch.current) return;
    didFetch.current = true;

    let cancelled = false;

    // Timeout safety net
    const timer = setTimeout(() => {
      if (!cancelled && !user) {
        // API is hanging — if we have a cached user, use it; otherwise fail
        const cached = (() => { try { return JSON.parse(localStorage.getItem("user")); } catch { return null; } })();
        if (cached) {
          setUser(cached);
          setLoading(false);
        } else {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          setAuthFailed(true);
          setLoading(false);
        }
      }
    }, 5000);

    (async () => {
      try {
        const [profile, sources] = await Promise.all([
          authFetch("/api/user/me"),
          authFetch("/api/income-sources"),
        ]);
        if (cancelled) return;

        // Auto-complete onboarding for existing users with data
        const hasSources = Array.isArray(sources) && sources.length > 0;
        if (!profile.onboardingComplete && hasSources) {
          try {
            await authFetch("/api/user/complete-onboarding", { method: "POST" });
            profile.onboardingComplete = true;
          } catch { /* non-critical */ }
        }

        setUser(profile);
        localStorage.setItem("user", JSON.stringify(profile));
      } catch (err) {
        if (cancelled) return;
        // Auth failed — clear token so we don't loop back from /login
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setAuthFailed(true);
      } finally {
        clearTimeout(timer);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; clearTimeout(timer); };
  }, [token]);

  // No token or auth definitively failed → login (token already cleared)
  if (!token || authFailed) {
    return <Navigate to="/login" replace />;
  }

  // Still loading and no cached user → show spinner
  if (loading && !user) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", justifyContent: "center",
        alignItems: "center", minHeight: "100vh", gap: "0.5rem",
        color: "var(--text-secondary, #8492A6)", fontFamily: "inherit",
      }}>
        <div style={{
          width: 28, height: 28, border: "3px solid currentColor",
          borderTopColor: "transparent", borderRadius: "50%",
          animation: "spin 0.6s linear infinite",
        }} />
        <span style={{ fontSize: "0.85rem" }}>Loading...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  // If we still have no user at all, bail to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Onboarding routing
  if (user.onboardingComplete === false && !isOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }
  if (user.onboardingComplete !== false && isOnboarding) {
    return <Navigate to="/app" replace />;
  }

  return children;
};

export default ProtectedRoute;
