import { useState } from "react";
import { authFetch } from "../apiClient";

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, textAlign: "center" }}>
        <h3 style={{ margin: "0 0 0.25rem" }}>Unlock Premium</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", margin: "0 0 0.75rem" }}>
          $4.99/month or $39.99/year (save 33%)
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1rem", textAlign: "left" }}>
          {features.map((f) => (
            <li key={f} style={{ padding: "0.3rem 0", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ color: "var(--teal)" }}>&#x2713;</span> {f}
            </li>
          ))}
        </ul>
        {error && (
          <div className="inline-error" style={{ marginBottom: "0.5rem", textAlign: "left" }}>{error}</div>
        )}
        <button
          type="button"
          className="primary-button"
          style={{ width: "100%", marginBottom: "0.5rem" }}
          onClick={handleUpgrade}
          disabled={loading}
        >
          {loading ? "Redirecting..." : "Start Free Trial \u2014 3 days free"}
        </button>
        <button type="button" className="link-button" style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }} onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
};

export default UpgradeModal;
