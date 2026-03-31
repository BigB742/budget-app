import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { authFetch } from "../apiClient";

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  const location = useLocation();
  const isOnOnboardingRoute =
    location.pathname.startsWith("/onboarding/income") ||
    location.pathname.startsWith("/onboarding/bills");

  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [incomeSources, setIncomeSources] = useState(null);
  const [loading, setLoading] = useState(!!token);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const loadData = async () => {
      try {
        const [profile, sources] = await Promise.all([
          authFetch("/api/user/me"),
          authFetch("/api/income-sources"),
        ]);
        setUser(profile);
        setIncomeSources(Array.isArray(sources) ? sources : []);
        localStorage.setItem("user", JSON.stringify(profile));
      } catch (err) {
        if (err.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token]);

  const needsOnboarding = useMemo(() => {
    if (incomeSources === null) return false;
    return incomeSources.length === 0;
  }, [incomeSources]);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (loading) {
    return <p>Loading...</p>;
  }

  if (needsOnboarding && !isOnOnboardingRoute) {
    return <Navigate to="/onboarding/income" replace />;
  }

  if (!needsOnboarding && isOnOnboardingRoute) {
    return <Navigate to="/app" replace />;
  }

  return children;
};

export default ProtectedRoute;
