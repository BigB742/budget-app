import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../apiClient";
import { formatDate } from "../utils/dateUtils";
import { useSubscription } from "../hooks/useSubscription";
import { useToast } from "../context/ToastContext";
import FreeLimitModal from "../components/FreeLimitModal";
import { currency } from "../utils/currency";
import PageContainer from "../components/PageContainer";

const BILL_CATS = ["Car Payment", "Gym", "Insurance", "Internet", "Phone", "Rent", "Subscriptions", "Utilities", "Other"];

const emptyForm = { name: "", amount: "", dueDay: "", category: "Other", startDate: "", lastPaymentDate: "", lastPaymentAmount: "" };

const Bills = () => {
  const { isFree } = useSubscription();
  const toast = useToast();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [limitModal, setLimitModal] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const b = await authFetch("/api/bills");
      setBills([...(b || [])].sort((a, b2) => (a.dueDayOfMonth || 0) - (b2.dueDayOfMonth || 0)));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    if (isFree && bills.length >= 5) { setLimitModal("bills"); return; }
    setEditingBill(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (b) => {
    setEditingBill(b);
    setForm({
      name: b.name || "",
      amount: String(b.amount || ""),
      dueDay: String(b.dueDayOfMonth || b.dueDay || ""),
      category: b.category || "Other",
      startDate: b.startDate ? new Date(b.startDate).toISOString().slice(0, 10) : "",
      lastPaymentDate: b.lastPaymentDate ? new Date(b.lastPaymentDate).toISOString().slice(0, 10) : "",
      lastPaymentAmount: b.lastPaymentAmount != null ? String(b.lastPaymentAmount) : "",
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const payload = {
      name: form.name, amount: Number(form.amount), dueDayOfMonth: Number(form.dueDay),
      category: form.category, startDate: form.startDate || null,
      lastPaymentDate: form.lastPaymentDate || null,
      lastPaymentAmount: form.lastPaymentAmount ? Number(form.lastPaymentAmount) : null,
    };
    try {
      const wasFirst = !editingBill && bills.length === 0;
      if (editingBill) {
        await authFetch(`/api/bills/${editingBill._id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await authFetch("/api/bills", { method: "POST", body: JSON.stringify(payload) });
      }
      setForm({ ...emptyForm });
      setEditingBill(null);
      setShowModal(false);
      load();
      if (wasFirst) toast?.showToast?.("First bill saved. PayPulse will track this every month.");
    } catch { /* ignore */ }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this bill?")) return;
    try { await authFetch(`/api/bills/${id}`, { method: "DELETE" }); load(); } catch {}
  };

  const monthlyObligations = bills.reduce((s, b) => s + Number(b.amount || 0), 0);

  return (
    <PageContainer>
      <div className="pp5-page-header">
        <h1 className="type-display">Bills</h1>
        <p className="pp5-page-subtitle">Your recurring obligations.</p>
      </div>

      <section className="pp5-card-xl" style={{ marginBottom: "var(--space-7)" }}>
        <div className="type-eyebrow" style={{ marginBottom: 12 }}>Total monthly payments</div>
        <div className="type-headline" style={{ color: "var(--color-semantic-negative)", fontVariantNumeric: "tabular-nums" }}>
          {currency.format(monthlyObligations)}
        </div>
      </section>

      <section className="pp5-section">
        <div className="pp5-section-header">
          <h2 className="type-headline">Recurring bills</h2>
          <button type="button" className="pp5-btn pp5-btn-primary" onClick={openAdd}>Add bill</button>
        </div>

        {loading ? (
          <p className="pp5-empty">Loading…</p>
        ) : bills.length === 0 ? (
          <p className="pp5-empty">No bills yet.</p>
        ) : (
          <div className="pp5-list-card">
            {bills.map((b) => (
              <div key={b._id} className="pp5-row">
                <div className="pp5-row-left">
                  <div className="pp5-row-primary">
                    {b.name}
                    {b.lastPaymentDate && <span className="pp5-pill pp5-pill-orange">Ends {formatDate(b.lastPaymentDate)}</span>}
                    {b.startDate && <span className="pp5-pill pp5-pill-neutral">From {formatDate(b.startDate)}</span>}
                  </div>
                  <div className="pp5-row-secondary">Due day {b.dueDayOfMonth} · {b.category}</div>
                </div>
                <div className="pp5-row-right">
                  <span className="pp5-row-amount negative">{currency.format(b.amount)}</span>
                  <button type="button" className="pp5-icon-btn" onClick={() => openEdit(b)} title="Edit">Edit</button>
                  <button type="button" className="pp5-icon-btn destructive" onClick={() => handleDelete(b._id)} title="Remove">×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showModal && (
        <div className="pp5-modal-overlay" onClick={() => { setShowModal(false); setEditingBill(null); }}>
          <div className="pp5-modal pp5-modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="pp5-modal-header">
              <h4 className="pp5-modal-title">{editingBill ? "Edit bill" : "New bill"}</h4>
              <button type="button" className="pp5-modal-close" onClick={() => { setShowModal(false); setEditingBill(null); }}>×</button>
            </div>
            <form className="pp5-modal-body" onSubmit={handleSave}>
              <div className="pp5-field">
                <label className="pp5-field-label">Name</label>
                <input className="pp5-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
              </div>
              <div className="pp5-field">
                <label className="pp5-field-label">Amount</label>
                <input className="pp5-input" type="number" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required />
              </div>
              <div className="pp5-field">
                <label className="pp5-field-label">Due day of month</label>
                <input className="pp5-input" type="number" min="1" max="31" value={form.dueDay} onChange={(e) => setForm((p) => ({ ...p, dueDay: e.target.value }))} required />
              </div>
              <div className="pp5-field">
                <label className="pp5-field-label">Category</label>
                <select className="pp5-select" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                  {BILL_CATS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="pp5-field">
                <label className="pp5-field-label">Start date</label>
                <input className="pp5-input" type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
                <p className="pp5-field-help">Optional. When did this bill start?</p>
              </div>
              <div className="pp5-field">
                <label className="pp5-field-label">End date</label>
                <input className="pp5-input" type="date" value={form.lastPaymentDate} onChange={(e) => setForm((p) => ({ ...p, lastPaymentDate: e.target.value }))} />
                <p className="pp5-field-help">Optional. For payment plans or ending subscriptions.</p>
              </div>
              <div className="pp5-field">
                <label className="pp5-field-label">Final payment amount</label>
                <input className="pp5-input" type="number" step="0.01" value={form.lastPaymentAmount} onChange={(e) => setForm((p) => ({ ...p, lastPaymentAmount: e.target.value }))} placeholder="If different from regular amount" />
                <p className="pp5-field-help">Optional.</p>
              </div>
              <div className="pp5-modal-actions">
                <button type="button" className="pp5-btn pp5-btn-secondary" onClick={() => { setShowModal(false); setEditingBill(null); }}>Cancel</button>
                <button type="submit" className="pp5-btn pp5-btn-primary">{editingBill ? "Save changes" : "Add bill"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {limitModal && <FreeLimitModal type={limitModal} onClose={() => setLimitModal(null)} />}
    </PageContainer>
  );
};

export default Bills;
