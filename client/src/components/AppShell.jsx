import { NavLink, Outlet, useNavigate } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/app", label: "Dashboard", icon: "\u2302" },
  { to: "/app/calendar", label: "Calendar", icon: "\ud83d\udcc5" },
  { to: "/app/history", label: "History", icon: "\ud83d\udcca" },
  { to: "/app/bills", label: "Bills & Income", icon: "\ud83d\udcb3" },
  { to: "/app/settings", label: "Settings", icon: "\u2699" },
];

const AppShell = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-dot" />PayPulse
        </div>
        <ul className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === "/app"} className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
                <span className="sidebar-icon">{item.icon}</span>{item.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="sidebar-bottom">
          <button type="button" className="sidebar-logout" onClick={handleLogout}>Log out</button>
        </div>
      </nav>

      <main className="shell-main"><Outlet /></main>

      <nav className="bottom-tabs">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/app"} className={({ isActive }) => `tab-item${isActive ? " active" : ""}`}>
            <span className="tab-icon">{item.icon}</span><span className="tab-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default AppShell;
