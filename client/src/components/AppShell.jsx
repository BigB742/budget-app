import { useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { DataCacheProvider } from "../context/DataCache";
import SessionTimeout from "./SessionTimeout";
import AppHeader from "./AppHeader";
import SideDrawer from "./SideDrawer";
import {
  IconHome,
  IconCalendar,
  IconReceipt,
  IconCard,
  IconSettings,
} from "./AppIcons";

// Mobile bottom tabs — the five most-used pages. Income and Savings
// live in the slide-out drawer to keep the bar uncluttered.
const BOTTOM_TABS = [
  { to: "/app",          label: "Home",     Icon: IconHome },
  { to: "/app/calendar", label: "Calendar", Icon: IconCalendar },
  { to: "/app/expenses", label: "Expenses", Icon: IconReceipt },
  { to: "/app/bills",    label: "Bills",    Icon: IconCard },
  { to: "/app/settings", label: "Settings", Icon: IconSettings },
];

const AppShell = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  return (
    <DataCacheProvider>
      <div className="app-shell">
        <AppHeader onOpenDrawer={() => setDrawerOpen(true)} />

        <SideDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onLogout={handleLogout}
        />

        <main
          className="shell-main"
          /* Re-fire the fade-in animation on every route change so the
             transition between pages feels intentional, not jarring. */
          key={location.pathname}
        >
          <Outlet />
        </main>

        <nav className="bottom-tabs" aria-label="Primary navigation">
          {BOTTOM_TABS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/app"}
              className={({ isActive }) => `tab-item${isActive ? " active" : ""}`}
            >
              <Icon />
              <span className="tab-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <SessionTimeout />
      </div>
    </DataCacheProvider>
  );
};

export default AppShell;
