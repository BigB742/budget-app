import { useState } from "react";
import UpgradeModal from "./UpgradeModal";

const LIMITS = {
  bills: { max: 5, label: "5 bills" },
  income: { max: 1, label: "1 income source" },
  oneTimeIncome: { max: 3, label: "3 one-time income entries" },
};

const FreeLimitModal = ({ type, onClose }) => {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const limit = LIMITS[type] || { max: 0, label: "items" };

  if (showUpgrade) return <UpgradeModal onClose={onClose} />;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, textAlign: "center" }}>
        <h4 style={{ margin: "0 0 0.5rem" }}>Free plan limit reached</h4>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", margin: "0 0 1rem" }}>
          You've reached the free plan limit of {limit.label}. Upgrade to Premium for unlimited access.
        </p>
        <button type="button" className="primary-button" style={{ width: "100%", marginBottom: "0.5rem" }} onClick={() => setShowUpgrade(true)}>
          Upgrade to Premium
        </button>
        <button type="button" className="link-button" style={{ color: "var(--text-muted)", fontSize: "0.78rem" }} onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
};

export { LIMITS };
export default FreeLimitModal;
