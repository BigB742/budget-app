import { Link } from "react-router-dom";
import { IconMenu } from "./AppIcons";

// Sticky top header bar used on every authenticated page.
// Logo left, hamburger right. Fixed position, 56px tall on mobile.
const AppHeader = ({ onOpenDrawer }) => (
  <header className="pp-header" role="banner">
    <Link to="/app" className="pp-header-brand" aria-label="PayPulse home">
      <span className="pp-header-brand-dot" />
      <span className="pp-header-brand-name">PayPulse</span>
    </Link>
    <button
      type="button"
      className="pp-header-btn"
      onClick={onOpenDrawer}
      aria-label="Open menu"
    >
      <IconMenu />
    </button>
  </header>
);

export default AppHeader;
