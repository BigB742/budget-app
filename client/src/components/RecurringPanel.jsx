import { useEffect, useMemo, useState } from "react";
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

const formatUtcDate = (isoDateString) => {
  if (!isoDateString) return "";
  const d = new Date(isoDateString);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${month}/${day}/${year}`;
};

const RecurringPanel = ({
  bills = [],
  incomes = [],
  onAddBill,
  onDeleteBill,
  onAddIncome,
  onDeleteIncome,
  mobileOpen,
  onToggleMobile,
  incomeSettings,
  triggerAddBill = 0,
  triggerAddIncome = 0,
}) => {
  const [showBillModal, setShowBillModal] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [billForm, setBillForm] = useState({
    name: "",
    amount: "",
    dueDay: "",
    category: "Other",
  });
  const [incomeForm, setIncomeForm] = useState({
    date: "",
    amount: "",
    description: "",
  });
  const [billError, setBillError] = useState("");
  const [incomeError, setIncomeError] = useState("");

  const safeIncomes = Array.isArray(incomes)
    ? incomes
    : incomes && typeof incomes === "object"
    ? Object.values(incomes)
    : [];

  const safeBills = Array.isArray(bills)
    ? bills
    : bills && typeof bills === "object"
    ? Object.values(bills)
    : [];

  const sortedIncomes = useMemo(
    () =>
      [...safeIncomes]
        .filter((i) => i?.date)
        .sort((a, b) => new Date(a.date) - new Date(b.date)),
    [safeIncomes]
  );

  const handleBillSubmit = async (event) => {
    event.preventDefault();
    setBillError("");
    try {
      await onAddBill?.(billForm);
      setBillForm({ name: "", amount: "", dueDay: "", category: "Other" });
      setShowBillModal(false);
    } catch (err) {
      console.error(err);
      setBillError("Unable to save bill.");
    }
  };

  const handleIncomeSubmit = async (event) => {
    event.preventDefault();
    setIncomeError("");
    try {
      await onAddIncome?.(incomeForm);
      setIncomeForm({ date: "", amount: "", description: "" });
      setShowIncomeModal(false);
    } catch (err) {
      console.error(err);
      setIncomeError("Unable to save income.");
    }
  };

  useEffect(() => {
    if (triggerAddBill > 0) {
      setShowBillModal(true);
    }
  }, [triggerAddBill]);

  useEffect(() => {
    if (triggerAddIncome > 0) {
      setShowIncomeModal(true);
    }
  }, [triggerAddIncome]);

  return (
    <div className={`recurring-panel ${mobileOpen ? "open" : ""}`}>
      <div className="recurring-header">
        <div>
          <h3>Bills &amp; income</h3>
        </div>
        <button type="button" className="ghost-button" onClick={onToggleMobile}>
          {mobileOpen ? "Hide" : "Show"}
        </button>
      </div>

      <div className="recurring-section">
        <div className="recurring-section-header">
          <div>
            <h4>Paychecks</h4>
          </div>
          <Link to="/settings/income" className="primary-button">
            Edit pay schedule
          </Link>
        </div>
        {sortedIncomes.length === 0 ? (
          incomeSettings?.amount && incomeSettings?.frequency ? (
            <div className="recurring-card">
              <div>
                <p className="entry-title">
                  {incomeSettings.frequency === "weekly"
                    ? "Weekly paycheck"
                    : incomeSettings.frequency === "biweekly"
                    ? "Biweekly paycheck"
                    : "Monthly paycheck"}
                </p>
                {incomeSettings.lastPaycheckDate && (
                  <p className="muted">
                    Last paycheck: {formatUtcDate(incomeSettings.lastPaycheckDate)}
                  </p>
                )}
              </div>
              <div className="recurring-actions">
                <span className="entry-amount positive">
                  {currency.format(Number(incomeSettings.amount) || 0)}
                </span>
              </div>
            </div>
          ) : (
            <p className="empty-row">No paycheck added yet.</p>
          )
        ) : (
          <div className="recurring-list">
            {sortedIncomes.map((income) => (
              <div key={income._id} className="recurring-card">
                <div>
                  <p className="entry-title">{income.description || "Income"}</p>
                  <p className="muted">{income.date?.slice(0, 10)}</p>
                </div>
                <div className="recurring-actions">
                  <span className="entry-amount positive">
                    {currency.format(income.amount || 0)}
                  </span>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => onDeleteIncome?.(income._id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="recurring-section">
        <div className="recurring-section-header">
          <div>
            <h4>Bills &amp; subscriptions</h4>
          </div>
          <button type="button" className="secondary-button" onClick={() => setShowBillModal(true)}>
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
                  <p className="entry-title">{bill.name}</p>
                  <p className="muted">
                    Day {bill.dueDay} · {bill.category}
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
              <button type="button" className="ghost-button" onClick={() => setShowBillModal(false)}>
                ✕
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
                Due day
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
                  {CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              {billError && <div className="inline-error">{billError}</div>}
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => setShowBillModal(false)}>
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

      {showIncomeModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h4>Add recurring income</h4>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setShowIncomeModal(false)}
              >
                ✕
              </button>
            </div>
            <form className="modal-form" onSubmit={handleIncomeSubmit}>
              <label>
                Pay date
                <input
                  type="date"
                  name="date"
                  value={incomeForm.date}
                  onChange={(e) => setIncomeForm((prev) => ({ ...prev, date: e.target.value }))}
                  required
                />
              </label>
              <label>
                Amount per paycheck
                <input
                  type="number"
                  step="0.01"
                  name="amount"
                  value={incomeForm.amount}
                  onChange={(e) =>
                    setIncomeForm((prev) => ({ ...prev, amount: e.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Description
                <input
                  type="text"
                  name="description"
                  value={incomeForm.description}
                  onChange={(e) =>
                    setIncomeForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="e.g. Paycheck"
                />
              </label>
              {incomeError && <div className="inline-error">{incomeError}</div>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setShowIncomeModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">
                  Save income
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
