import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useSubscription } from "../hooks/useSubscription";
import {
  IconMenu,
  IconClose,
  IconHome,
  IconCalendar,
  IconReceipt,
  IconCard,
  IconClipboardList,
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
  { to: "/app/bills",           label: "Bills",         Icon: IconCard },
  { to: "/app/payment-plans",  label: "Plans",         Icon: IconClipboardList },
  { to: "/app/income",         label: "Income",        Icon: IconTrending },
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
  const { isPremium } = useSubscription();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef(null);
  const navRef = useRef(null);
  const location = useLocation();
  const [underline, setUnderline] = useState({ left: 0, width: 0, visible: false });
  const user = getStoredUser();
  const initials = getInitials(user);
  const isAdmin = !!user?.isAdmin;

  // Measure the active link and position the teal underline under it.
  // Re-measures on route change, on resize, and whenever the nav layout
  // shifts (font loads, content changes).
  useLayoutEffect(() => {
    const measure = () => {
      const nav = navRef.current;
      if (!nav) return;
      const active = nav.querySelector(".pp-top-link.active");
      if (!active) {
        setUnderline((u) => ({ ...u, visible: false }));
        return;
      }
      const navBox = nav.getBoundingClientRect();
      const aBox = active.getBoundingClientRect();
      setUnderline({
        left: aBox.left - navBox.left,
        width: aBox.width,
        visible: true,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = "ResizeObserver" in window ? new ResizeObserver(measure) : null;
    if (ro && navRef.current) ro.observe(navRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      if (ro) ro.disconnect();
    };
  }, [location.pathname]);

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

  // Premium users get a gold ring around their avatar — no crown, no
  // text badge, no label. Just the ring and their initials.
  const isPremiumRing = isPremium;

  return (
    <header className="pp-top" role="banner">
      <div className="pp-top-inner">
        {/* Brand — left */}
        <Link to="/app" className="pp-top-brand" aria-label="PayPulse home">
          <span className="pp-top-brand-dot" />
          <span className="pp-top-brand-name">PayPulse</span>
        </Link>

        {/* Desktop nav — center/right, hidden on mobile */}
        <nav className="pp-top-nav" aria-label="Primary navigation" ref={navRef}>
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
          <span
            className={`pp-top-underline${underline.visible ? " is-visible" : ""}`}
            style={{ transform: `translateX(${underline.left}px)`, width: `${underline.width}px` }}
            aria-hidden="true"
          />
        </nav>

        {/* Right cluster — badge + avatar (desktop) / hamburger (mobile) */}
        <div className="pp-top-right">
          <div className="pp-top-avatar-wrap" ref={avatarRef}>
            <button
              type="button"
              className={`pp-top-avatar${isPremiumRing ? " pp-top-avatar-premium" : ""}`}
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
