import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { DataCacheProvider } from "../context/DataCache";
import SessionTimeout from "./SessionTimeout";
import TopNav from "./TopNav";
import TourOverlay from "./TourOverlay";

const AppShell = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showTour, setShowTour] = useState(false);

  // Auto-launch the tour ONCE on first visit after onboarding.
  // tourCompleted starts as `false` for new accounts. Once the tour is
  // completed or skipped, the TourOverlay saves tourCompleted: true to
  // both the backend and localStorage, preventing relaunch on refresh.
  // Existing accounts (where tourCompleted is undefined) do NOT see the
  // auto-launch — only accounts that went through onboarding (which
  // explicitly sets tourCompleted: false) trigger it.
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      if (u.tourCompleted === false && u.onboardingComplete && location.pathname === "/app") {
        setShowTour(true);
      }
    } catch { /* ignore */ }
  }, []); // run once on mount

  // Expose a global function so Settings / Help Center can relaunch
  useEffect(() => {
    window.__ppLaunchTour = () => setShowTour(true);
    return () => { delete window.__ppLaunchTour; };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  return (
    <DataCacheProvider>
      <div className="app-shell">
        <TopNav onLogout={handleLogout} />

        <main
          className="shell-main"
          key={location.pathname}
        >
          <Outlet />
        </main>

        <SessionTimeout />
        {showTour && <TourOverlay onFinish={() => setShowTour(false)} />}
      </div>
    </DataCacheProvider>
  );
};

export default AppShell;
