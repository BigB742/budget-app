import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { authFetch } from "../apiClient";

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  const location = useLocation();
  const isOnboarding = location.pathname === "/onboarding";
  const isSettingsIncome = location.pathname === "/settings/income";

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Fetch profile and income sources in parallel
        const [profile, sources] = await Promise.all([
          authFetch("/api/user/me"),
          authFetch("/api/income-sources"),
        ]);
        if (cancelled) return;

        // Auto-complete onboarding for existing users who already have data
        const hasSources = Array.isArray(sources) && sources.length > 0;
        if (!profile.onboardingComplete && hasSources) {
          // Existing user with data — mark onboarding done silently
          try {
            await authFetch("/api/user/complete-onboarding", { method: "POST" });
            profile.onboardingComplete = true;
          } catch { /* non-critical */ }
        }

        setUser(profile);
        localStorage.setItem("user", JSON.stringify(profile));
      } catch (err) {
        if (err.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [token, location.pathname]);

  if (!token) return <Navigate to="/login" replace />;
  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", color: "var(--text-secondary)" }}>Loading...</div>;

  const needsOnboarding = user && user.onboardingComplete === false;

  // User needs onboarding and isn't on the onboarding page → redirect there
  if (needsOnboarding && !isOnboarding) return <Navigate to="/onboarding" replace />;

  // User has completed onboarding but is on the onboarding page → redirect to dashboard
  if (user && user.onboardingComplete && isOnboarding) return <Navigate to="/app" replace />;

  return children;
};

export default ProtectedRoute;
