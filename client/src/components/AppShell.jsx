import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { DataCacheProvider } from "../context/DataCache";
import SessionTimeout from "./SessionTimeout";

const NAV_ITEMS = [
  { to: "/app", label: "Dashboard" },
  { to: "/app/calendar", label: "Calendar" },
  { to: "/app/history", label: "History" },
  { to: "/app/bills", label: "Bills & Income" },
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
          <div className="sidebar-brand"><span className="brand-dot" />PayPulse</div>
          <ul className="sidebar-nav">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.to === "/app"} className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} onClick={closeSidebar}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="sidebar-bottom">
            <button type="button" className="sidebar-logout" onClick={handleLogout}>
              <span className="logout-icon">&#x2190;</span>Log out
            </button>
          </div>
        </nav>

        <main className="shell-main"><Outlet /></main>

        <nav className="bottom-tabs">
          {NAV_ITEMS.map((item) => (
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
