import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { DataCacheProvider } from "../context/DataCache";
import { useSubscription } from "../hooks/useSubscription";
import SessionTimeout from "./SessionTimeout";

const NAV_ITEMS = [
  { to: "/app", label: "Dashboard" },
  { to: "/app/calendar", label: "Calendar" },
  { to: "/app/expenses", label: "Expenses" },
  { to: "/app/bills", label: "Bills" },
  { to: "/app/income", label: "Income" },
  { to: "/app/savings", label: "Savings" },
  { to: "/app/settings", label: "Settings" },
];

// Mobile bottom tabs — most-used pages only, to avoid cramming 7 items.
// Income and Savings live in the sidebar (accessible via hamburger on mobile).
const BOTTOM_TAB_ITEMS = [
  { to: "/app", label: "Home" },
  { to: "/app/calendar", label: "Calendar" },
  { to: "/app/expenses", label: "Expenses" },
  { to: "/app/bills", label: "Bills" },
  { to: "/app/settings", label: "Settings" },
];

const AppShell = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== "undefined" && window.innerWidth < 901) return false;
    const saved = localStorage.getItem("sidebarOpen");
    return saved === null ? true : saved === "true";
  });

  useEffect(() => {
    if (window.innerWidth >= 901) localStorage.setItem("sidebarOpen", String(sidebarOpen));
  }, [sidebarOpen]);

  const { isFree, isTrialing, isPremium } = useSubscription();
  const handleLogout = () => { localStorage.removeItem("token"); localStorage.removeItem("user"); navigate("/login"); };
  const toggleSidebar = () => setSidebarOpen((p) => !p);
  const closeSidebar = () => { if (window.innerWidth < 901) setSidebarOpen(false); };

  return (
    <DataCacheProvider>
      <div className={`app-shell${sidebarOpen ? " sidebar-open" : ""}`}>
        {/* Hamburger toggle */}
        <button type="button" className="hamburger-btn" onClick={toggleSidebar} aria-label="Toggle menu">
          {sidebarOpen ? "\u2715" : "\u2630"}
        </button>

        {/* Overlay for mobile */}
        {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

        <nav className={`sidebar${sidebarOpen ? " open" : ""}`}>
          <div className="sidebar-brand">
            <span className="brand-dot" />PayPulse
            {isPremium && <span className="plan-badge premium-plan">Premium</span>}
            {isTrialing && <span className="plan-badge trial-plan">Trial</span>}
            {isFree && <span className="plan-badge free-plan">Free</span>}
          </div>
          <ul className="sidebar-nav">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.to === "/app"} className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} onClick={closeSidebar}>
                  {item.label}
                </NavLink>
              </li>
            ))}
            {(() => { try { const u = JSON.parse(localStorage.getItem("user")); return !!u?.isAdmin; } catch { return false; } })() && (
              <li>
                <NavLink to="/admin" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} onClick={closeSidebar}>
                  Admin
                </NavLink>
              </li>
            )}
          </ul>
          <div className="sidebar-bottom">
            <button type="button" className="sidebar-logout" onClick={handleLogout}>
              <span className="logout-icon">&#x2190;</span>Log out
            </button>
            <p className="sidebar-brand-sub">PayPulse by Productos La Loma</p>
          </div>
        </nav>

        <main className="shell-main"><Outlet /></main>

        <nav className="bottom-tabs">
          {BOTTOM_TAB_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/app"} className={({ isActive }) => `tab-item${isActive ? " active" : ""}`}>
              <span className="tab-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <SessionTimeout />
      </div>
    </DataCacheProvider>
  );
};

export default AppShell;
