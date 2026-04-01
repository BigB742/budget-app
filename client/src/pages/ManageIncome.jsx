import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../apiClient";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const FREQ_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "twicemonthly", label: "Twice a month (1st & 15th)" },
  { value: "monthly", label: "Monthly" },
];

const formatFreq = (f) => FREQ_OPTIONS.find((o) => o.value === f)?.label || f;

const ManageIncome = () => {
  const [sources, setSources] = useState([]);
  const [oneTime, setOneTime] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [incomeType, setIncomeType] = useState("recurring");
  const [recForm, setRecForm] = useState({ name: "", amount: "", frequency: "biweekly", nextPayDate: "" });
  const [otForm, setOtForm] = useState({ name: "", amount: "", date: "", note: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, ot] = await Promise.all([
        authFetch("/api/income-sources"),
        authFetch("/api/one-time-income"),
      ]);
      setSources(Array.isArray(s) ? s : []);
      setOneTime(Array.isArray(ot) ? ot : []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAddRecurring = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await authFetch("/api/income-sources", { method: "POST", body: JSON.stringify({ name: recForm.name, amount: Number(recForm.amount), frequency: recForm.frequency, nextPayDate: recForm.nextPayDate, isPrimary: sources.length === 0 }) });
      setRecForm({ name: "", amount: "", frequency: "biweekly", nextPayDate: "" });
      setShowModal(false);
      load();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleAddOneTime = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await authFetch("/api/one-time-income", { method: "POST", body: JSON.stringify({ name: otForm.name, amount: Number(otForm.amount), date: otForm.date, note: otForm.note }) });
      setOtForm({ name: "", amount: "", date: "", note: "" });
      setShowModal(false);
      load();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handleDeleteSource = async (id) => {
    if (!window.confirm("Remove this income source?")) return;
    try { await authFetch(`/api/income-sources/${id}`, { method: "DELETE" }); load(); } catch { /* ignore */ }
  };

  const handleDeleteOneTime = async (id) => {
    try { await authFetch(`/api/one-time-income/${id}`, { method: "DELETE" }); load(); } catch { /* ignore */ }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

  return (
    <div className="manage-income-page">
      <div className="history-header">
        <h1>Manage Income</h1>
        <button type="button" className="primary-button" onClick={() => { setShowModal(true); setIncomeType("recurring"); }}>Add income</button>
      </div>

      {loading ? <p className="status">Loading...</p> : (
        <>
          {/* Recurring */}
          <section className="bi-section">
            <h2 className="section-title" style={{ marginBottom: "0.5rem" }}>Recurring income</h2>
            {sources.length === 0 ? <p className="empty-row">No recurring income sources yet.</p> : (
              <div className="recurring-list">
                {sources.map((s) => (
                  <div key={s._id} className="recurring-card">
                    <div>
                      <p className="entry-title">{s.name}{s.isPrimary && <span className="pill primary-pill">Primary</span>}</p>
                      <p className="muted">{formatFreq(s.frequency)} &middot; Next: {formatDate(s.nextPayDate)}</p>
                    </div>
                    <div className="recurring-actions">
                      <span className="entry-amount positive">{currency.format(s.amount)}</span>
                      <button type="button" className="ghost-button" onClick={() => handleDeleteSource(s._id)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* One-time */}
          <section className="bi-section">
            <h2 className="section-title" style={{ marginBottom: "0.5rem" }}>One-time income</h2>
            {oneTime.length === 0 ? <p className="empty-row">No one-time income yet.</p> : (
              <div className="recurring-list">
                {oneTime.map((ot) => (
                  <div key={ot._id} className="recurring-card">
                    <div>
                      <p className="entry-title">{ot.name}</p>
                      <p className="muted">{formatDate(ot.date)}{ot.note ? ` — ${ot.note}` : ""}</p>
                    </div>
                    <div className="recurring-actions">
                      <span className="entry-amount positive">{currency.format(ot.amount)}</span>
                      <button type="button" className="ghost-button" onClick={() => handleDeleteOneTime(ot._id)}>x</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Add modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>Add income</h4>
              <button type="button" className="ghost-button" onClick={() => setShowModal(false)}>&#x2715;</button>
            </div>

            {/* Type selector */}
            <div style={{ display: "flex", gap: "0.35rem", margin: "0.65rem 0" }}>
              <button type="button" className={`s-pill${incomeType === "recurring" ? " active" : ""}`} onClick={() => setIncomeType("recurring")}>Recurring paycheck</button>
              <button type="button" className={`s-pill${incomeType === "onetime" ? " active" : ""}`} onClick={() => setIncomeType("onetime")}>One-time income</button>
            </div>

            {incomeType === "recurring" ? (
              <form className="modal-form" onSubmit={handleAddRecurring}>
                <label>Source name<input value={recForm.name} onChange={(e) => setRecForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. FPE Inc" required /></label>
                <label>Amount per paycheck<input type="number" step="0.01" value={recForm.amount} onChange={(e) => setRecForm((p) => ({ ...p, amount: e.target.value }))} required /></label>
                <label>Frequency<select value={recForm.frequency} onChange={(e) => setRecForm((p) => ({ ...p, frequency: e.target.value }))}>
                  {FREQ_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select></label>
                <label>Next payday<input type="date" value={recForm.nextPayDate} onChange={(e) => setRecForm((p) => ({ ...p, nextPayDate: e.target.value }))} required /></label>
                <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "..." : "Save"}</button></div>
              </form>
            ) : (
              <form className="modal-form" onSubmit={handleAddOneTime}>
                <label>Source name<input value={otForm.name} onChange={(e) => setOtForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. FAFSA, Tax return, Uncle" required /></label>
                <label>Amount<input type="number" step="0.01" value={otForm.amount} onChange={(e) => setOtForm((p) => ({ ...p, amount: e.target.value }))} required /></label>
                <label>Date received<input type="date" value={otForm.date} onChange={(e) => setOtForm((p) => ({ ...p, date: e.target.value }))} required /></label>
                <label>Note (optional)<input value={otForm.note} onChange={(e) => setOtForm((p) => ({ ...p, note: e.target.value }))} /></label>
                <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setShowModal(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "..." : "Save"}</button></div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageIncome;
