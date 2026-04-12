import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../apiClient";
import { useDataCache } from "../context/DataCache";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const Savings = () => {
  const cache = useDataCache();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", amount: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await authFetch("/api/savings-goals");
      setGoals(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const amt = Number(form.amount);
    if (!form.name || form.name.length < 2 || !amt || amt < 0) return;
    setSaving(true);
    try {
      await authFetch("/api/savings-goals", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          targetAmount: 999999,
          savedAmount: amt,
          perPaycheckAmount: 0,
          category: "Savings",
        }),
      });
      setForm({ name: "", amount: "" });
      setShowAdd(false);
      load();
      if (cache?.fetchSummary) cache.fetchSummary(true);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleContribute = async (goal) => {
    const input = window.prompt(`Add to "${goal.name}"`, "0");
    if (!input) return;
    const amount = Number(input);
    if (!amount || amount <= 0) return;
    try {
      await authFetch(`/api/savings-goals/${goal._id}/contribute`, { method: "POST", body: JSON.stringify({ amount }) });
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      await authFetch("/api/expenses", { method: "POST", body: JSON.stringify({ date: dateStr, amount, category: "Savings", description: `Savings — ${goal.name}` }) });
      load();
      if (cache?.fetchSummary) cache.fetchSummary(true);
    } catch { /* ignore */ }
  };

  const handleWithdraw = async (goal) => {
    const input = window.prompt(`Withdraw from "${goal.name}" (max ${currency.format(goal.savedAmount || 0)})`, "0");
    if (!input) return;
    const amount = Number(input);
    if (!amount || amount <= 0 || amount > (goal.savedAmount || 0)) { alert("Invalid amount."); return; }
    try {
      await authFetch(`/api/savings-goals/${goal._id}/withdraw`, { method: "POST", body: JSON.stringify({ amount }) });
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      await authFetch("/api/one-time-income", { method: "POST", body: JSON.stringify({ name: `Savings Withdrawal — ${goal.name}`, amount, date: dateStr }) });
      load();
      if (cache?.fetchSummary) cache.fetchSummary(true);
    } catch { /* ignore */ }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this savings entry?")) return;
    try { await authFetch(`/api/savings-goals/${id}`, { method: "DELETE" }); load(); } catch { /* ignore */ }
  };

  const totalSaved = goals.reduce((s, g) => s + (g.savedAmount || 0), 0);

  return (
    <div className="bills-income-page">
      <h1>Savings</h1>

      {goals.length > 0 && (
        <div className="bi-summary-bar">
          <span>Total saved</span>
          <strong style={{ color: "var(--teal)" }}>{currency.format(totalSaved)}</strong>
        </div>
      )}

      <section className="bi-section">
        <div className="bi-section-head">
          <h2>Savings goals</h2>
          <button type="button" className="primary-button" onClick={() => setShowAdd(true)}>Add Savings</button>
        </div>

        {loading ? <p className="status">Loading...</p> : goals.length === 0 ? (
          <p className="empty-row">No savings yet. Start saving today.</p>
        ) : (
          <div className="recurring-list">
            {goals.map((g) => (
              <div key={g._id} className="recurring-card">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="entry-title">{g.name}</p>
                  <p className="muted">Current balance: {currency.format(g.savedAmount || 0)}</p>
                </div>
                <div className="recurring-actions">
                  <button type="button" className="secondary-button savings-plus-btn" onClick={() => handleContribute(g)}>+ Add</button>
                  {(g.savedAmount || 0) > 0 && (
                    <button type="button" className="ghost-button savings-minus-btn" onClick={() => handleWithdraw(g)}>- Withdraw</button>
                  )}
                  <button type="button" className="bill-icon-btn bill-icon-del" onClick={() => handleDelete(g._id)}>x</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h4>Add savings</h4><button type="button" className="ghost-button" onClick={() => setShowAdd(false)}>&#x2715;</button></div>
            <form className="modal-form" onSubmit={handleAdd}>
              <label>Name<input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Vacation, Emergency fund" required /></label>
              <label>Starting amount<input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required /></label>
              <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setShowAdd(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "..." : "Save"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Savings;
