import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../apiClient";
import { useDataCache } from "../context/DataCache";
import { currency } from "../utils/currency";
import PageContainer from "../components/PageContainer";
import AnimatedNumber from "../components/AnimatedNumber";

const FREQ_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every two weeks" },
  { value: "twicemonthly", label: "Twice a month, 1st and 15th" },
  { value: "monthly", label: "Monthly" },
];

const formatFreq = (f) => FREQ_OPTIONS.find((o) => o.value === f)?.label || f;

const ManageIncome = () => {
  const cache = useDataCache();
  const [sources, setSources] = useState([]);
  const [oneTime, setOneTime] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [incomeType, setIncomeType] = useState("recurring");
  const [recForm, setRecForm] = useState({ name: "", amount: "", frequency: "biweekly", nextPayDate: "" });
  const [otForm, setOtForm] = useState({ name: "", amount: "", date: "" });
  const [editingSource, setEditingSource] = useState(null);
  const [editingOneTime, setEditingOneTime] = useState(null);
  const [saving, setSaving] = useState(false);
  const [projected, setProjected] = useState(null);

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

  useEffect(() => {
    load();
    cache?.fetchSummary?.();
    authFetch("/api/summary/projected-annual-income").then(setProjected).catch(() => {});
  }, [load]);

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

  const handleEditRecurring = async (e) => {
    e.preventDefault();
    if (!editingSource) return;
    setSaving(true);
    try {
      await authFetch(`/api/income-sources/${editingSource}`, { method: "PUT", body: JSON.stringify({ name: recForm.name, amount: Number(recForm.amount), frequency: recForm.frequency, nextPayDate: recForm.nextPayDate }) });
      setRecForm({ name: "", amount: "", frequency: "biweekly", nextPayDate: "" });
      setEditingSource(null);
      setShowModal(false);
      load();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const openEditModal = (s) => {
    setEditingSource(s._id);
    setRecForm({ name: s.name || "", amount: String(s.amount || ""), frequency: s.frequency || "biweekly", nextPayDate: s.nextPayDate ? new Date(s.nextPayDate).toISOString().slice(0, 10) : "" });
    setIncomeType("recurring");
    setShowModal(true);
  };

  const handleAddOneTime = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingOneTime) {
        await authFetch(`/api/one-time-income/${editingOneTime}`, { method: "PUT", body: JSON.stringify({ name: otForm.name, amount: Number(otForm.amount), date: otForm.date }) });
      } else {
        await authFetch("/api/one-time-income", { method: "POST", body: JSON.stringify({ name: otForm.name, amount: Number(otForm.amount), date: otForm.date }) });
      }
      setOtForm({ name: "", amount: "", date: "" });
      setEditingOneTime(null);
      setShowModal(false);
      load();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const openEditOneTime = (ot) => {
    setEditingOneTime(ot._id);
    setOtForm({
      name: ot.name || "",
      amount: String(ot.amount || ""),
      date: ot.date ? new Date(ot.date).toISOString().slice(0, 10) : "",
    });
    setIncomeType("onetime");
    setShowModal(true);
  };

  const handleDeleteSource = async (id) => {
    if (!window.confirm("Remove this income source?")) return;
    try { await authFetch(`/api/income-sources/${id}`, { method: "DELETE" }); load(); } catch { /* ignore */ }
  };

  const handleDeleteOneTime = async (id) => {
    if (!window.confirm("Remove this one-time income?")) return;
    try { await authFetch(`/api/one-time-income/${id}`, { method: "DELETE" }); load(); } catch { /* ignore */ }
  };

  const formatDate = (d) => {
    if (!d) return "";
    const dt = new Date(d);
    return new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())
      .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <PageContainer>
      <div className="pp5-page-header">
        <h1 className="type-display">Income</h1>
        <p className="pp5-page-subtitle">What you earn.</p>
      </div>

      <div className="stagger-list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: "var(--space-7)" }}>
        {cache?.summary?.nextPayDate && (
          <div className="pp5-card has-inset-highlight">
            <div className="type-eyebrow" style={{ marginBottom: 12 }}>Next payday</div>
            <div className="type-headline" style={{ color: "var(--color-accent-teal)" }}>{formatDate(cache.summary.nextPayDate)}</div>
          </div>
        )}
        {projected && (
          <div className="pp5-card has-inset-highlight">
            <div className="type-eyebrow" style={{ marginBottom: 12 }}>Projected this year</div>
            <div className="type-headline" style={{ color: "var(--color-accent-teal)", fontVariantNumeric: "tabular-nums" }}>
              <AnimatedNumber value={projected.projected} />
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-6)" }}>
        <button type="button" className="pp5-btn pp5-btn-primary" onClick={() => { setEditingSource(null); setRecForm({ name: "", amount: "", frequency: "biweekly", nextPayDate: "" }); setShowModal(true); setIncomeType("recurring"); }}>Add income</button>
      </div>

      {loading ? <p className="pp5-empty">Loading…</p> : (
        <>
          <section className="pp5-section">
            <div className="pp5-section-header">
              <h2 className="type-headline">Recurring income</h2>
            </div>
            {sources.length === 0 ? <p className="pp5-empty">No recurring income yet.</p> : (
              <div className="pp5-list-card stagger-list">
                {sources.map((s) => (
                  <div key={s._id} className="pp5-row">
                    <div className="pp5-row-left">
                      <div className="pp5-row-primary">
                        {s.name}
                        {s.isPrimary && <span className="pp5-pill pp5-pill-teal">Primary</span>}
                      </div>
                      <div className="pp5-row-secondary">{formatFreq(s.frequency)} · Next pay {formatDate(s.nextPayDate)}</div>
                    </div>
                    <div className="pp5-row-right">
                      <span className="pp5-row-amount positive">{currency.format(s.amount)}</span>
                      <button type="button" className="pp5-icon-btn" onClick={() => openEditModal(s)}>Edit</button>
                      <button type="button" className="pp5-icon-btn destructive" onClick={() => handleDeleteSource(s._id)}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="pp5-section">
            <div className="pp5-section-header">
              <h2 className="type-headline">One-time income</h2>
            </div>
            {oneTime.length === 0 ? <p className="pp5-empty">No one-time income yet.</p> : (
              <div className="pp5-list-card stagger-list">
                {oneTime.map((ot) => (
                  <div key={ot._id} className="pp5-row">
                    <div className="pp5-row-left">
                      <div className="pp5-row-primary">{ot.name}</div>
                      <div className="pp5-row-secondary">{formatDate(ot.date)}</div>
                    </div>
                    <div className="pp5-row-right">
                      <span className="pp5-row-amount positive">{currency.format(ot.amount)}</span>
                      <button type="button" className="pp5-icon-btn" onClick={() => openEditOneTime(ot)}>Edit</button>
                      <button type="button" className="pp5-icon-btn destructive" onClick={() => handleDeleteOneTime(ot._id)}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {showModal && (
        <div className="pp5-modal-overlay" onClick={() => { setShowModal(false); setEditingSource(null); setEditingOneTime(null); }}>
          <div className="pp5-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pp5-modal-header">
              <h4 className="pp5-modal-title">{editingSource || editingOneTime ? "Edit income" : "New income"}</h4>
              <button type="button" className="pp5-modal-close" onClick={() => { setShowModal(false); setEditingSource(null); setEditingOneTime(null); }}>×</button>
            </div>

            {!editingSource && !editingOneTime && (
              <div className="pp5-segmented" style={{ marginBottom: 20, alignSelf: "flex-start" }}>
                <button type="button" className={incomeType === "recurring" ? "active" : ""} onClick={() => setIncomeType("recurring")}>Recurring paycheck</button>
                <button type="button" className={incomeType === "onetime" ? "active" : ""} onClick={() => setIncomeType("onetime")}>One-time income</button>
              </div>
            )}

            {incomeType === "recurring" ? (
              <form className="pp5-modal-body" onSubmit={editingSource ? handleEditRecurring : handleAddRecurring}>
                <div className="pp5-field">
                  <label className="pp5-field-label">Source name</label>
                  <input className="pp5-input" value={recForm.name} onChange={(e) => setRecForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. FPE Inc" required />
                </div>
                <div className="pp5-field">
                  <label className="pp5-field-label">Amount per paycheck</label>
                  <input className="pp5-input" type="number" step="0.01" value={recForm.amount} onChange={(e) => setRecForm((p) => ({ ...p, amount: e.target.value }))} required />
                </div>
                <div className="pp5-field">
                  <label className="pp5-field-label">Frequency</label>
                  <select className="pp5-select" value={recForm.frequency} onChange={(e) => setRecForm((p) => ({ ...p, frequency: e.target.value }))}>
                    {FREQ_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
                <div className="pp5-field">
                  <label className="pp5-field-label">Next payday</label>
                  <input className="pp5-input" type="date" value={recForm.nextPayDate} onChange={(e) => setRecForm((p) => ({ ...p, nextPayDate: e.target.value }))} required />
                </div>
                <div className="pp5-modal-actions">
                  <button type="button" className="pp5-btn pp5-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="pp5-btn pp5-btn-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                </div>
              </form>
            ) : (
              <form className="pp5-modal-body" onSubmit={handleAddOneTime}>
                <div className="pp5-field">
                  <label className="pp5-field-label">Source</label>
                  <input className="pp5-input" value={otForm.name} onChange={(e) => setOtForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. FAFSA, tax return, uncle" required />
                </div>
                <div className="pp5-field">
                  <label className="pp5-field-label">Amount</label>
                  <input className="pp5-input" type="number" step="0.01" value={otForm.amount} onChange={(e) => setOtForm((p) => ({ ...p, amount: e.target.value }))} required />
                </div>
                <div className="pp5-field">
                  <label className="pp5-field-label">Date received</label>
                  <input className="pp5-input" type="date" value={otForm.date} onChange={(e) => setOtForm((p) => ({ ...p, date: e.target.value }))} required />
                </div>
                <div className="pp5-modal-actions">
                  <button type="button" className="pp5-btn pp5-btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="pp5-btn pp5-btn-primary" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  );
};

export default ManageIncome;
