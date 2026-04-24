import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { DataCacheProvider } from "../context/DataCache";
import SessionTimeout from "./SessionTimeout";
import TopNav from "./TopNav";
import TourOverlay from "./TourOverlay";
import OutstandingQueueModal from "../features/outstanding/OutstandingQueueModal";

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

  // Expose a global function so Settings / Help Center can relaunch.
  // The function navigates to the dashboard FIRST and sets a pending
  // flag — the next effect picks it up once the route settles so the
  // tour spotlights the dashboard elements, not whatever page the
  // button was on.
  useEffect(() => {
    window.__ppLaunchTour = () => {
      if (location.pathname !== "/app") {
        sessionStorage.setItem("pp_tourPending", "1");
        navigate("/app");
      } else {
        setShowTour(true);
      }
    };
    return () => { delete window.__ppLaunchTour; };
  }, [navigate, location.pathname]);

  // Pick up the pending flag once the dashboard mounts after a
  // navigation-from-Settings launch. Small delay lets the DOM settle
  // so querySelector on .hero resolves.
  useEffect(() => {
    if (location.pathname !== "/app") return;
    if (sessionStorage.getItem("pp_tourPending") === "1") {
      sessionStorage.removeItem("pp_tourPending");
      const t = setTimeout(() => setShowTour(true), 200);
      return () => clearTimeout(t);
    }
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("pp_overdueCheckShown");
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
        {!showTour && <OutstandingQueueModal />}
      </div>
    </DataCacheProvider>
  );
};

export default AppShell;
