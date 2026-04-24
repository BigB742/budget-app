import { useState } from "react";
import { authFetch } from "../apiClient";
import Modal from "./ui/Modal";

const UpgradeModal = ({ onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const features = [
    "Calendar full year projections",
    "PDF expense reports",
    "Custom expense categories",
    "No ads",
    "Unlimited bills & income sources",
    "Spending insights",
  ];

  const handleUpgrade = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await authFetch("/api/stripe/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ plan: "monthly" }),
      });
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error("[UpgradeModal] checkout failed:", err);
      setError(err?.message || "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} titleId="upgrade-modal-title" size="sm">
      <h2 id="upgrade-modal-title" className="pp5-modal-title" style={{ textAlign: "center" }}>
        Unlock Premium
      </h2>
      <p className="pp5-modal-description" style={{ textAlign: "center" }}>
        $4.99/month or $39.99/year (save 33%)
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: "20px 0", textAlign: "left" }}>
        {features.map((f) => (
          <li key={f} style={{ padding: "6px 0", fontSize: "14px", display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--color-text-primary)" }}>
            <span style={{ color: "var(--color-accent-teal)" }}>&#x2713;</span> {f}
          </li>
        ))}
      </ul>
      {error && <p className="pp5-field-error">{error}</p>}
      <div className="pp5-modal-actions-stack">
        <button
          type="button"
          className="pp5-btn pp5-btn-primary pp5-btn-block"
          onClick={handleUpgrade}
          disabled={loading}
        >
          {loading ? "Redirecting…" : "Start free trial"}
        </button>
        <button type="button" className="pp5-btn pp5-btn-text pp5-btn-block" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </Modal>
  );
};

export default UpgradeModal;
