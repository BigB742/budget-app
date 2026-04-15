import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { DataCacheProvider } from "../context/DataCache";
import SessionTimeout from "./SessionTimeout";
import TopNav from "./TopNav";

const AppShell = () => {
  const navigate = useNavigate();
  const location = useLocation();

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
          /* Re-fire the fade-in animation on every route change so the
             transition between pages feels intentional, not jarring. */
          key={location.pathname}
        >
          <Outlet />
        </main>

        <SessionTimeout />
      </div>
    </DataCacheProvider>
  );
};

export default AppShell;
