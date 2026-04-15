import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useSubscription } from "../hooks/useSubscription";
import {
  IconMenu,
  IconClose,
  IconHome,
  IconCalendar,
  IconReceipt,
  IconCard,
  IconTrending,
  IconPiggy,
  IconSettings,
  IconLogout,
  IconShield,
} from "./AppIcons";

const NAV = [
  { to: "/app",           label: "Dashboard", Icon: IconHome,     end: true },
  { to: "/app/calendar",  label: "Calendar",  Icon: IconCalendar },
  { to: "/app/expenses",  label: "Expenses",  Icon: IconReceipt },
  { to: "/app/bills",     label: "Bills",     Icon: IconCard },
  { to: "/app/income",    label: "Income",    Icon: IconTrending },
  { to: "/app/savings",   label: "Savings",   Icon: IconPiggy },
  { to: "/app/settings",  label: "Settings",  Icon: IconSettings },
];

const getStoredUser = () => {
  try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; }
};

const getInitials = (user) => {
  const first = (user?.firstName || user?.name || user?.email || "?").trim();
  const last = (user?.lastName || "").trim();
  if (first && last) return (first[0] + last[0]).toUpperCase();
  const parts = first.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return first.slice(0, 2).toUpperCase();
};

const TopNav = ({ onLogout }) => {
  const { isPremium, isTrialing, trialDaysLeft } = useSubscription();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef(null);
  const user = getStoredUser();
  const initials = getInitials(user);
  const isAdmin = !!user?.isAdmin;

  // Close the avatar dropdown when clicking outside
  useEffect(() => {
    if (!avatarOpen) return undefined;
    const onDocClick = (e) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target)) setAvatarOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [avatarOpen]);

  // Lock body scroll while mobile menu is open
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  // Close the mobile menu on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setMobileOpen(false);
      setAvatarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const badge = isTrialing
    ? <span className="pp-top-badge trial">Trial · {trialDaysLeft}d</span>
    : isPremium
      ? <span className="pp-top-badge premium">Premium</span>
      : null;

  return (
    <header className="pp-top" role="banner">
      <div className="pp-top-inner">
        {/* Brand — left */}
        <Link to="/app" className="pp-top-brand" aria-label="PayPulse home">
          <span className="pp-top-brand-dot" />
          <span className="pp-top-brand-name">PayPulse</span>
        </Link>

        {/* Desktop nav — center/right, hidden on mobile */}
        <nav className="pp-top-nav" aria-label="Primary navigation">
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `pp-top-link${isActive ? " active" : ""}`}
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) => `pp-top-link${isActive ? " active" : ""}`}
            >
              <IconShield />
              <span>Admin</span>
            </NavLink>
          )}
        </nav>

        {/* Right cluster — badge + avatar (desktop) / hamburger (mobile) */}
        <div className="pp-top-right">
          {badge}
          <div className="pp-top-avatar-wrap" ref={avatarRef}>
            <button
              type="button"
              className="pp-top-avatar"
              onClick={() => setAvatarOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={avatarOpen}
              aria-label="Account menu"
            >
              {initials}
            </button>
            {avatarOpen && (
              <div className="pp-top-avatar-menu" role="menu">
                <div className="pp-top-avatar-header">
                  <span className="pp-top-avatar-name">{user?.firstName || user?.name || user?.email || "Account"}</span>
                  {user?.email && <span className="pp-top-avatar-email">{user.email}</span>}
                </div>
                <Link
                  to="/app/settings"
                  className="pp-top-avatar-item"
                  role="menuitem"
                  onClick={() => setAvatarOpen(false)}
                >
                  <IconSettings />
                  <span>Settings</span>
                </Link>
                {isAdmin && (
                  <Link
                    to="/admin"
                    className="pp-top-avatar-item"
                    role="menuitem"
                    onClick={() => setAvatarOpen(false)}
                  >
                    <IconShield />
                    <span>Admin</span>
                  </Link>
                )}
                <button
                  type="button"
                  className="pp-top-avatar-item pp-top-avatar-logout"
                  role="menuitem"
                  onClick={() => { setAvatarOpen(false); onLogout?.(); }}
                >
                  <IconLogout />
                  <span>Log out</span>
                </button>
              </div>
            )}
          </div>

          {/* Hamburger — mobile only */}
          <button
            type="button"
            className="pp-top-hamburger"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>

      {/* Mobile slide-down menu */}
      {mobileOpen && (
        <div
          className="pp-top-mobile-overlay"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <nav
        className={`pp-top-mobile${mobileOpen ? " open" : ""}`}
        aria-label="Mobile navigation"
        aria-hidden={!mobileOpen}
      >
        <ul>
          {NAV.map(({ to, label, Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `pp-top-mobile-link${isActive ? " active" : ""}`}
              >
                <Icon />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
          {isAdmin && (
            <li>
              <NavLink
                to="/admin"
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `pp-top-mobile-link${isActive ? " active" : ""}`}
              >
                <IconShield />
                <span>Admin</span>
              </NavLink>
            </li>
          )}
          <li>
            <button
              type="button"
              className="pp-top-mobile-link pp-top-mobile-logout"
              onClick={() => { setMobileOpen(false); onLogout?.(); }}
            >
              <IconLogout />
              <span>Log out</span>
            </button>
          </li>
        </ul>
      </nav>
    </header>
  );
};

export default TopNav;
