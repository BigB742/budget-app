import { useState, useEffect } from "react";

import { authFetch } from "../apiClient";

/* ─── inline hook ──────────────────────────────────────────── */

const useDebts = () => {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await authFetch("/api/debts");
        if (!cancelled) {
          setDebts(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) setError(err?.message || "Failed to load debts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const reload = () => setReloadToken((t) => t + 1);

  const createDebt = async (payload) => {
    const created = await authFetch("/api/debts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setDebts((prev) => [...prev, created]);
    return created;
  };

  const makePayment = async (id, amount) => {
    const updated = await authFetch(`/api/debts/${id}/payment`, {
      method: "POST",
      body: JSON.stringify({ amount }),
    });
    if (updated.isActive === false) {
      setDebts((prev) => prev.filter((d) => d._id !== id));
    } else {
      setDebts((prev) => prev.map((d) => (d._id === id ? updated : d)));
    }
    return updated;
  };

  const deleteDebt = async (id) => {
    await authFetch(`/api/debts/${id}`, { method: "DELETE" });
    setDebts((prev) => prev.filter((d) => d._id !== id));
  };

  return { debts, loading, error, reload, createDebt, makePayment, deleteDebt };
};

/* ─── component ────────────────────────────────────────────── */

const DebtPanel = () => {
  const { debts, loading, error, createDebt, makePayment, deleteDebt } = useDebts();
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    originalBalance: "",
    currentBalance: "",
    minimumPayment: "",
    interestRate: "",
    dueDayOfMonth: "",
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createDebt({
        name: form.name,
        originalBalance: Number(form.originalBalance),
        currentBalance: Number(form.currentBalance),
        minimumPayment: Number(form.minimumPayment),
        interestRate: Number(form.interestRate) || 0,
        dueDayOfMonth: Number(form.dueDayOfMonth),
      });
      setForm({
        name: "",
        originalBalance: "",
        currentBalance: "",
        minimumPayment: "",
        interestRate: "",
        dueDayOfMonth: "",
      });
      setShowAddModal(false);
    } catch (err) {
      console.error(err);
      alert("Failed to create debt.");
    } finally {
      setSaving(false);
    }
  };

  const handlePayment = async (debt) => {
    const input = window.prompt(
      `Make payment on "${debt.name}"`,
      String(debt.minimumPayment || 0)
    );
    if (!input) return;
    const amount = Number(input);
    if (!amount || amount <= 0) return;
    try {
      await makePayment(debt._id, amount);
    } catch (err) {
      console.error(err);
      alert("Failed to record payment.");
    }
  };

  const paidPercent = (debt) => {
    if (!debt.originalBalance) return 0;
    const paid = debt.originalBalance - debt.currentBalance;
    return Math.min(100, Math.max(0, Math.round((paid / debt.originalBalance) * 100)));
  };

  const formatDate = (iso) => {
    if (!iso) return "N/A";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  };

  return (
    <div className="recurring-section" style={{ marginTop: "1rem" }}>
      <div className="recurring-section-header">
        <div>
          <h4>Debt payoff tracker</h4>
        </div>
        <button type="button" className="secondary-button" onClick={() => setShowAddModal(true)}>
          Add debt
        </button>
      </div>
      {error && <p className="status status-error">{error}</p>}
      {loading ? (
        <p className="status">Loading debts...</p>
      ) : debts.length === 0 ? (
        <p className="empty-row">No active debts. Add one to start tracking payoff.</p>
      ) : (
        <div className="recurring-list">
          {debts.map((debt) => (
            <div key={debt._id} className="recurring-card">
              <div>
                <p className="entry-title">{debt.name}</p>
                <p style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0.25rem 0" }}>
                  ${Number(debt.currentBalance).toFixed(2)}
                </p>
                <div className="progress-bar" style={{ marginTop: "0.35rem" }}>
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${paidPercent(debt)}%` }}
                  ></div>
                </div>
                <p className="muted" style={{ marginTop: "0.35rem" }}>
                  {paidPercent(debt)}% paid off
                </p>
                <p className="muted">
                  Min payment: ${Number(debt.minimumPayment).toFixed(2)} &middot; Due day {debt.dueDayOfMonth}
                </p>
                {debt.interestRate > 0 && (
                  <p className="muted">{debt.interestRate}% APR</p>
                )}
                <p className="muted">
                  Est. payoff: {formatDate(debt.estimatedPayoffDate)}
                </p>
              </div>
              <div className="recurring-actions">
                <button type="button" className="primary-button" onClick={() => handlePayment(debt)}>
                  Make payment
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    const confirmed = window.confirm(`Remove "${debt.name}" from tracker?`);
                    if (confirmed) deleteDebt(debt._id).catch(() => alert("Failed to delete debt."));
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <div className="modal-header">
              <h4>Add debt</h4>
              <button type="button" className="ghost-button" onClick={() => setShowAddModal(false)}>
                ✕
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSubmit}>
              <label>
                Debt name
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  placeholder="Credit card, student loan..."
                />
              </label>
              <label>
                Original balance
                <input
                  type="number"
                  step="0.01"
                  name="originalBalance"
                  value={form.originalBalance}
                  onChange={handleChange}
                  required
                />
              </label>
              <label>
                Current balance
                <input
                  type="number"
                  step="0.01"
                  name="currentBalance"
                  value={form.currentBalance}
                  onChange={handleChange}
                  required
                />
              </label>
              <label>
                Minimum payment
                <input
                  type="number"
                  step="0.01"
                  name="minimumPayment"
                  value={form.minimumPayment}
                  onChange={handleChange}
                  required
                />
              </label>
              <label>
                Interest rate (% APR)
                <input
                  type="number"
                  step="0.01"
                  name="interestRate"
                  value={form.interestRate}
                  onChange={handleChange}
                  placeholder="0"
                />
              </label>
              <label>
                Due day of month
                <input
                  type="number"
                  min="1"
                  max="31"
                  name="dueDayOfMonth"
                  value={form.dueDayOfMonth}
                  onChange={handleChange}
                  required
                />
              </label>
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => setShowAddModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? "Saving..." : "Add debt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DebtPanel;
