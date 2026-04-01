import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../apiClient";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const SavingsPanel = () => {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", amount: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState({});

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
    if (!form.name || !form.amount) return;
    setSaving(true);
    try {
      await authFetch("/api/savings-goals", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          targetAmount: 999999,
          savedAmount: Number(form.amount),
          perPaycheckAmount: 0,
          category: "Savings",
        }),
      });
      setForm({ name: "", amount: "", note: "" });
      setShowAdd(false);
      load();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleContribute = async (goal) => {
    const input = window.prompt(`Add to "${goal.name}"`, "0");
    if (!input) return;
    const amount = Number(input);
    if (!amount || amount <= 0) return;
    try {
      await authFetch(`/api/savings-goals/${goal._id}/contribute`, {
        method: "POST",
        body: JSON.stringify({ amount }),
      });
      load();
    } catch { /* ignore */ }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this savings entry?")) return;
    try { await authFetch(`/api/savings-goals/${id}`, { method: "DELETE" }); load(); } catch { /* ignore */ }
  };

  const totalSaved = goals.reduce((s, g) => s + (g.savedAmount || 0), 0);

  return (
    <div className="recurring-section" style={{ borderBottom: "none" }}>
      <div className="recurring-section-header">
        <div>
          <h4>Savings</h4>
          {goals.length > 0 && <p className="muted">Total saved: {currency.format(totalSaved)}</p>}
        </div>
        <button type="button" className="primary-button" onClick={() => setShowAdd(true)}>Add savings</button>
      </div>

      {loading ? <p className="status">Loading...</p> : goals.length === 0 ? (
        <p className="empty-row">No savings yet. Start saving today.</p>
      ) : (
        <div className="recurring-list">
          {goals.map((g) => (
            <div key={g._id} className="recurring-card" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p className="entry-title">{g.name}</p>
                  <p className="muted">Saved: {currency.format(g.savedAmount || 0)}</p>
                </div>
                <div className="recurring-actions">
                  <button type="button" className="secondary-button" onClick={() => handleContribute(g)}>+ Add</button>
                  <button type="button" className="ghost-button" onClick={() => handleDelete(g._id)}>x</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h4>Add savings</h4><button type="button" className="ghost-button" onClick={() => setShowAdd(false)}>&#x2715;</button></div>
            <form className="modal-form" onSubmit={handleAdd}>
              <label>Name<input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Vacation, Emergency fund" required /></label>
              <label>Amount saved<input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required /></label>
              <label>Note (optional)<input value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} /></label>
              <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setShowAdd(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "..." : "Save"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SavingsPanel;
