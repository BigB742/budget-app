/**
 * TODO: Replace with Google AdSense or direct ad partner SDK.
 * Pass userBalance and topCategories as targeting signals to serve
 * contextually relevant ads. Users with $200+ spendable balance are
 * premium targets for retail/entertainment advertisers.
 */

const AD_SIZES = {
  banner: { width: 728, height: 90, mobileWidth: 320, mobileHeight: 50 },
  sidebar: { width: 300, height: 250 },
  inline: { width: 468, height: 60, mobileWidth: 320, mobileHeight: 50 },
};

const AdSlot = ({ placement = "banner", isPremium = false }) => {
  if (isPremium) return null;

  const size = AD_SIZES[placement] || AD_SIZES.banner;

  return (
    <div className={`ad-slot ad-${placement}`}>
      <div className="ad-placeholder">
        <span className="ad-label">Ad space</span>
        <span className="ad-dims">
          {size.width}x{size.height}
        </span>
      </div>
    </div>
  );
};

export default AdSlot;
