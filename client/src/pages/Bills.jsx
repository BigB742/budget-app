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
      <h1 className="heading-display" style={{ marginBottom: 32 }}>Bills</h1>
      <div className="bills-income-page">

      <div className="bi-summary-bar">
        <span>Total monthly payments</span>
        <strong style={{ color: "var(--red)" }}>{currency.format(monthlyObligations)}</strong>
      </div>

      <section className="bi-section">
        <div className="bi-section-head">
          <h2>Recurring bills</h2>
          <button type="button" className="primary-button" onClick={openAdd}>Add bill</button>
        </div>
        {loading ? <p className="status">Loading...</p> : bills.length === 0 ? <p className="empty-row">No bills yet.</p> : (
          <div className="recurring-list">
            {bills.map((b) => (
              <div key={b._id} className="recurring-card">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="entry-title">
                    {b.name}
                    {b.lastPaymentDate && <span className="pill ends-pill">Ends {formatDate(b.lastPaymentDate)}</span>}
                    {b.startDate && <span className="pill" style={{ fontSize: "0.58rem" }}>From {formatDate(b.startDate)}</span>}
                  </p>
                  <p className="muted">Due day {b.dueDayOfMonth}. {b.category}</p>
                </div>
                <div className="bill-card-right">
                  <span className="entry-amount negative">{currency.format(b.amount)}</span>
                  <div className="bill-card-actions">
                    <button type="button" className="bill-icon-btn" onClick={() => openEdit(b)} title="Edit">E</button>
                    <button type="button" className="bill-icon-btn bill-icon-del" onClick={() => handleDelete(b._id)} title="Remove">x</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showModal && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setEditingBill(null); }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h4>{editingBill ? "Edit bill" : "Add bill"}</h4><button type="button" className="ghost-button" onClick={() => { setShowModal(false); setEditingBill(null); }}>x</button></div>
            <form className="modal-form" onSubmit={handleSave}>
              <label>Name<input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required /></label>
              <label>Amount<input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} required /></label>
              <label>Due day of month<input type="number" min="1" max="31" value={form.dueDay} onChange={(e) => setForm((p) => ({ ...p, dueDay: e.target.value }))} required /></label>
              <label>Category<select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>{BILL_CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label>Start date (optional)<input type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} /><span className="muted" style={{ fontSize: "0.68rem" }}>When did this bill start?</span></label>
              <label>End date (optional)<input type="date" value={form.lastPaymentDate} onChange={(e) => setForm((p) => ({ ...p, lastPaymentDate: e.target.value }))} /><span className="muted" style={{ fontSize: "0.68rem" }}>When does this bill end? (e.g. payment plan)</span></label>
              <label>Final payment amount (optional)<input type="number" step="0.01" value={form.lastPaymentAmount} onChange={(e) => setForm((p) => ({ ...p, lastPaymentAmount: e.target.value }))} placeholder="If different from regular amount" /></label>
              <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => { setShowModal(false); setEditingBill(null); }}>Cancel</button><button type="submit" className="primary-button">{editingBill ? "Save changes" : "Add bill"}</button></div>
            </form>
          </div>
        </div>
      )}

      {limitModal && <FreeLimitModal type={limitModal} onClose={() => setLimitModal(null)} />}
      </div>
    </PageContainer>
  );
};

export default Bills;
