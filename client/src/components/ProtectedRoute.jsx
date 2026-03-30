import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { authFetch } from "../apiClient";

const ONBOARDING_PATHS = ["/onboarding/income", "/onboarding/bills"];

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
  const [loading, setLoading] = useState(!!token && !user);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    const loadUser = async () => {
      try {
        const profile = await authFetch("/api/user/me");
        setUser(profile);
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
    loadUser();
  }, [token]);

  const needsOnboarding = useMemo(() => {
    if (!user) return false;
    const settings = user.incomeSettings || {};
    return !settings.lastPaycheckDate || !settings.amount;
  }, [user]);

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
