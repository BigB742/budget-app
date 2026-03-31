const UpgradeModal = ({ onClose }) => {
  const features = [
    "Calendar full year projections",
    "PDF expense reports",
    "Custom expense categories",
    "No ads",
    "Unlimited bills & income sources",
    "Spending insights",
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, textAlign: "center" }}>
        <h3 style={{ margin: "0 0 0.25rem" }}>Unlock Premium</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", margin: "0 0 0.75rem" }}>
          $6.99/month or $59.99/year (save 28%)
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1rem", textAlign: "left" }}>
          {features.map((f) => (
            <li key={f} style={{ padding: "0.3rem 0", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ color: "var(--teal)" }}>&#x2713;</span> {f}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="primary-button"
          style={{ width: "100%", marginBottom: "0.5rem" }}
          onClick={() => { console.log("Stripe checkout coming soon"); onClose(); }}
        >
          Start Free Trial &mdash; 7 days free
        </button>
        <button type="button" className="link-button" style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }} onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
};

export default UpgradeModal;
