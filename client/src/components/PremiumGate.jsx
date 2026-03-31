import { useState } from "react";
import UpgradeModal from "./UpgradeModal";

const PremiumGate = ({ isPremium, children, label = "This is a premium feature" }) => {
  const [showUpgrade, setShowUpgrade] = useState(false);

  if (isPremium) return children;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ filter: "blur(3px)", pointerEvents: "none", userSelect: "none" }}>
        {children}
      </div>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "0.5rem",
        background: "rgba(255,255,255,0.7)", borderRadius: "var(--radius)",
      }}>
        <span style={{ fontSize: "1.5rem" }}>&#x1f512;</span>
        <p style={{ margin: 0, fontWeight: 600, fontSize: "0.85rem", color: "var(--text)" }}>{label}</p>
        <button type="button" className="primary-button" onClick={() => setShowUpgrade(true)} style={{ fontSize: "0.78rem", height: 34 }}>
          Upgrade to Premium
        </button>
      </div>
      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}
    </div>
  );
};

export default PremiumGate;
