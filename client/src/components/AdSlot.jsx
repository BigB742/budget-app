/**
 * Placeholder ad slot. Hidden under 768px via CSS (.ad-slot { display: none }
 * in design-system.css) so it doesn't break the mobile layout. At ≥768px
 * it renders a centered 320x50 mobile-banner rectangle with a dashed
 * border and a small "Ad" label — the standard non-intrusive format until
 * a real ad SDK is wired in.
 *
 * Premium and trialing users never see this.
 */
const AdSlot = ({ placement = "banner", isPremium = false }) => {
  if (isPremium) return null;

  return (
    <div className={`ad-slot ad-${placement}`} aria-hidden="true">
      <div className="ad-placeholder">
        <span className="ad-label">Ad</span>
      </div>
    </div>
  );
};

export default AdSlot;
