import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const CATEGORY_OPTIONS = [
  "Subscriptions",
  "Food",
  "Gas",
  "Rent",
  "Utilities",
  "Gym",
  "Car Payment",
  "Insurance",
  "Other",
];

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const formatFrequency = (freq) => {
  if (freq === "biweekly") return "Bi-weekly";
  if (freq === "weekly") return "Weekly";
  if (freq === "monthly") return "Monthly";
  return freq;
};

const formatReadableDate = (iso) => {
  if (!iso) return "";
  const str = typeof iso === "string" ? iso : iso.toISOString?.() || String(iso);
  const [y, m, d] = str.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return str.slice(0, 10);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const formatEndDate = (iso) => {
  if (!iso) return "";
  const str = typeof iso === "string" ? iso : iso.toISOString?.() || String(iso);
  const [y, m] = str.slice(0, 10).split("-").map(Number);
  if (!y || !m) return "";
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

const RecurringPanel = ({
  bills = [],
  incomeSources = [],
  onAddBill,
  onDeleteBill,
  onSourcesChanged,
  mobileOpen,
  onToggleMobile,
  triggerAddBill = 0,
}) => {
  const [showBillModal, setShowBillModal] = useState(false);
  const [billForm, setBillForm] = useState({
    name: "",
    amount: "",
    dueDay: "",
    category: "Other",
    lastPaymentDate: "",
    lastPaymentAmount: "",
  });
  const [billError, setBillError] = useState("");

  const safeBills = Array.isArray(bills) ? bills : [];
  const safeSources = Array.isArray(incomeSources) ? incomeSources : [];

  const handleBillSubmit = async (event) => {
    event.preventDefault();
    setBillError("");
    try {
      await onAddBill?.(billForm);
      setBillForm({
        name: "",
        amount: "",
        dueDay: "",
        category: "Other",
        lastPaymentDate: "",
        lastPaymentAmount: "",
      });
      setShowBillModal(false);
    } catch (err) {
      console.error(err);
      setBillError("Unable to save bill.");
    }
  };

  useEffect(() => {
    if (triggerAddBill > 0) setShowBillModal(true);
  }, [triggerAddBill]);

  return (
    <div className={`recurring-panel ${mobileOpen ? "open" : ""}`}>
      <div className="recurring-header">
        <h2>Income &amp; Bills</h2>
        <button type="button" className="ghost-button" onClick={onToggleMobile}>
          {mobileOpen ? "Hide" : "Show"}
        </button>
      </div>

      <div className="recurring-section">
        <div className="recurring-section-header">
          <h4>Income sources</h4>
          <Link to="/settings/income" className="primary-button">
            Manage
          </Link>
        </div>
        {safeSources.length === 0 ? (
          <p className="empty-row">No income sources yet.</p>
        ) : (
          <div className="recurring-list">
            {safeSources.map((source) => (
              <div key={source._id} className="recurring-card">
                <div>
                  <p className="entry-title">
                    {source.name}
                    {source.isPrimary && <span className="pill primary-pill">Primary</span>}
                  </p>
                  <p className="muted">
                    {formatFrequency(source.frequency)} &middot; next:{" "}
                    {formatReadableDate(source.nextPayDate)}
                  </p>
                </div>
                <div className="recurring-actions">
                  <span className="entry-amount positive">
                    {currency.format(Number(source.amount) || 0)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="recurring-section">
        <div className="recurring-section-header">
          <h4>Bills &amp; subscriptions</h4>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowBillModal(true)}
          >
            Add bill
          </button>
        </div>
        {safeBills.length === 0 ? (
          <p className="empty-row">No bills yet. Add your first one.</p>
        ) : (
          <div className="recurring-list">
            {safeBills.map((bill) => (
              <div key={bill._id} className="recurring-card">
                <div>
                  <p className="entry-title">
                    {bill.name}
                    {bill.lastPaymentDate && (
                      <span className="pill ends-pill">
                        Ends {formatEndDate(bill.lastPaymentDate)}
                      </span>
                    )}
                  </p>
                  <p className="muted">
                    Day {bill.dueDayOfMonth || bill.dueDay} &middot; {bill.category}
                  </p>
                </div>
                <div className="recurring-actions">
                  <span className="entry-amount negative">{currency.format(bill.amount)}</span>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onDeleteBill?.(bill._id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showBillModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h4>Add bill</h4>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowBillModal(false)}
              >
                &#x2715;
              </button>
            </div>
            <form className="modal-form" onSubmit={handleBillSubmit}>
              <label>
                Name
                <input
                  name="name"
                  value={billForm.name}
                  onChange={(e) => setBillForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </label>
              <label>
                Amount
                <input
                  type="number"
                  step="0.01"
                  name="amount"
                  value={billForm.amount}
                  onChange={(e) => setBillForm((prev) => ({ ...prev, amount: e.target.value }))}
                  required
                />
              </label>
              <label>
                Due day of month
                <input
                  type="number"
                  name="dueDay"
                  min="1"
                  max="31"
                  value={billForm.dueDay}
                  onChange={(e) => setBillForm((prev) => ({ ...prev, dueDay: e.target.value }))}
                  required
                />
              </label>
              <label>
                Category
                <select
                  name="category"
                  value={billForm.category}
                  onChange={(e) => setBillForm((prev) => ({ ...prev, category: e.target.value }))}
                >
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Last payment date (optional)
                <input
                  type="date"
                  name="lastPaymentDate"
                  value={billForm.lastPaymentDate}
                  onChange={(e) =>
                    setBillForm((prev) => ({ ...prev, lastPaymentDate: e.target.value }))
                  }
                />
              </label>
              <label>
                Last payment amount (optional)
                <input
                  type="number"
                  step="0.01"
                  name="lastPaymentAmount"
                  placeholder="If different from regular amount"
                  value={billForm.lastPaymentAmount}
                  onChange={(e) =>
                    setBillForm((prev) => ({ ...prev, lastPaymentAmount: e.target.value }))
                  }
                />
              </label>
              {billError && <div className="inline-error">{billError}</div>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setShowBillModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  Save bill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecurringPanel;
