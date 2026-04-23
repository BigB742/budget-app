import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useSubscription } from "../hooks/useSubscription";
import {
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
  { to: "/app",           label: "Dashboard", Icon: IconHome },
  { to: "/app/calendar",  label: "Calendar",  Icon: IconCalendar },
  { to: "/app/expenses",  label: "Expenses",  Icon: IconReceipt },
  { to: "/app/bills",     label: "Bills",     Icon: IconCard },
  { to: "/app/income",    label: "Income",    Icon: IconTrending },
  { to: "/app/savings",   label: "Savings",   Icon: IconPiggy },
  { to: "/app/settings",  label: "Settings",  Icon: IconSettings },
];

const SideDrawer = ({ open, onClose, onLogout }) => {
  const { isPremium, isTrialing, isFree, trialDaysLeft } = useSubscription();

  // Lock body scroll while the drawer is open so the background
  // doesn't scroll underneath.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isAdmin = (() => {
    try { return !!JSON.parse(localStorage.getItem("user"))?.isAdmin; } catch { return false; }
  })();

  return (
    <>
      <div
        className={`pp-drawer-overlay${open ? " open" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`pp-drawer${open ? " open" : ""}`}
        aria-hidden={!open}
        aria-label="Main navigation"
      >
        <div className="pp-drawer-brand">
          <span className="pp-header-brand-dot" />
          <span className="pp-drawer-brand-name">PayPulse</span>
          <button
            type="button"
            className="pp-drawer-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <IconClose />
          </button>
        </div>

        <nav>
          <ul className="pp-drawer-nav">
            {NAV.map(({ to, label, Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === "/app"}
                  onClick={onClose}
                  className={({ isActive }) => `pp-drawer-link${isActive ? " active" : ""}`}
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
                  onClick={onClose}
                  className={({ isActive }) => `pp-drawer-link${isActive ? " active" : ""}`}
                >
                  <IconShield />
                  <span>Admin</span>
                </NavLink>
              </li>
            )}
          </ul>
        </nav>

        <div className="pp-drawer-footer">
          <div className="pp-drawer-status">
            <span>Subscription</span>
            {/* Trialing users have full Premium access, so the chrome-level
                pill reads Premium — we don't surface "Trial" as a separate
                countdown state here; the Subscription page owns that
                messaging. */}
            {(isPremium || isTrialing) && <span className="pp-status-pill premium">Premium</span>}
            {isFree && !isTrialing && <span className="pp-status-pill free">Free</span>}
          </div>
          <button type="button" className="pp-drawer-logout" onClick={onLogout}>
            <IconLogout />
            <span>Log out</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default SideDrawer;
