import { useState } from "react";
import UpgradeModal from "./UpgradeModal";
import Modal from "./ui/Modal";

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
    <Modal isOpen onClose={onClose} titleId="free-limit-title" size="sm">
      <h2 id="free-limit-title" className="pp5-modal-title" style={{ textAlign: "center" }}>
        Free plan limit reached
      </h2>
      <p className="pp5-modal-description" style={{ textAlign: "center" }}>
        You've reached the free plan limit of {limit.label}. Upgrade to Premium for unlimited access.
      </p>
      <div className="pp5-modal-actions-stack">
        <button type="button" className="pp5-btn pp5-btn-primary pp5-btn-block" onClick={() => setShowUpgrade(true)}>
          Upgrade to Premium
        </button>
        <button type="button" className="pp5-btn pp5-btn-text pp5-btn-block" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </Modal>
  );
};

export { LIMITS };
export default FreeLimitModal;
