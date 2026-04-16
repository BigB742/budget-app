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

  // Auto-launch the tour on first visit after onboarding (tourCompleted === false)
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      if (!u.tourCompleted && u.onboardingComplete && location.pathname === "/app") {
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
