import { NavLink, Outlet } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/app", label: "Dashboard", icon: "\u2302" },
  { to: "/app/calendar", label: "Calendar", icon: "\ud83d\udcc5" },
  { to: "/app/bills", label: "Bills & Income", icon: "\ud83d\udcb3" },
  { to: "/settings/income", label: "Settings", icon: "\u2699" },
];

const AppShell = () => {
  return (
    <div className="app-shell">
      {/* Desktop sidebar */}
      <nav className="sidebar">
        <div className="sidebar-brand">Budget</div>
        <ul className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/app"}
                className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
              >
                <span className="sidebar-icon">{item.icon}</span>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main content */}
      <main className="shell-main">
        <Outlet />
      </main>

      {/* Mobile bottom tabs */}
      <nav className="bottom-tabs">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/app"}
            className={({ isActive }) => `tab-item${isActive ? " active" : ""}`}
          >
            <span className="tab-icon">{item.icon}</span>
            <span className="tab-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default AppShell;
