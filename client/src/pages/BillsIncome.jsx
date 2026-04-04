import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { authFetch } from "../apiClient";
import { formatDate } from "../utils/dateUtils";
import { useIncomeSources } from "../hooks/useIncomeSources";
import { useSubscription } from "../hooks/useSubscription";
import SavingsPanel from "../components/SavingsPanel";
import FreeLimitModal from "../components/FreeLimitModal";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const formatFrequency = (f) => f === "biweekly" ? "Bi-weekly" : f === "weekly" ? "Weekly" : f === "twicemonthly" ? "1st & 15th" : f === "monthly" ? "Monthly" : f;
const BILL_CATS = ["Car Payment", "Gym", "Insurance", "Internet", "Phone", "Rent", "Subscriptions", "Utilities", "Other"];

const emptyForm = { name: "", amount: "", dueDay: "", category: "Other", startDate: "", lastPaymentDate: "", lastPaymentAmount: "" };

const BillsIncome = () => {
  const { sources } = useIncomeSources();
  const { isFree } = useSubscription();
  const [bills, setBills] = useState([]);
  const [oneTimeIncomes, setOneTimeIncomes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBillModal, setShowBillModal] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [limitModal, setLimitModal] = useState(null);
  const [billForm, setBillForm] = useState({ ...emptyForm });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [b, ot] = await Promise.all([
        authFetch("/api/bills"),
        authFetch("/api/one-time-income").catch(() => []),
      ]);
      setBills([...(b || [])].sort((a, b2) => (a.dueDayOfMonth || 0) - (b2.dueDayOfMonth || 0)));
      setOneTimeIncomes(Array.isArray(ot) ? ot : []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openAddBill = () => {
    if (isFree && bills.length >= 5) { setLimitModal("bills"); return; }
    setEditingBill(null);
    setBillForm({ ...emptyForm });
    setShowBillModal(true);
  };

  const openEditBill = (b) => {
    setEditingBill(b);
    setBillForm({
      name: b.name || "",
      amount: String(b.amount || ""),
      dueDay: String(b.dueDayOfMonth || b.dueDay || ""),
      category: b.category || "Other",
      startDate: b.startDate ? new Date(b.startDate).toISOString().slice(0, 10) : "",
      lastPaymentDate: b.lastPaymentDate ? new Date(b.lastPaymentDate).toISOString().slice(0, 10) : "",
      lastPaymentAmount: b.lastPaymentAmount != null ? String(b.lastPaymentAmount) : "",
    });
    setShowBillModal(true);
  };

  const handleSaveBill = async (e) => {
    e.preventDefault();
    const payload = {
      name: billForm.name, amount: Number(billForm.amount), dueDayOfMonth: Number(billForm.dueDay),
      category: billForm.category, startDate: billForm.startDate || null,
      lastPaymentDate: billForm.lastPaymentDate || null,
      lastPaymentAmount: billForm.lastPaymentAmount ? Number(billForm.lastPaymentAmount) : null,
    };
    try {
      if (editingBill) {
        await authFetch(`/api/bills/${editingBill._id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await authFetch("/api/bills", { method: "POST", body: JSON.stringify(payload) });
      }
      setBillForm({ ...emptyForm });
      setEditingBill(null);
      setShowBillModal(false);
      loadData();
    } catch { /* ignore */ }
  };

  const handleDeleteBill = async (id) => {
    if (!window.confirm("Remove this bill?")) return;
    try { await authFetch(`/api/bills/${id}`, { method: "DELETE" }); loadData(); } catch {}
  };
  const handleDeleteOneTime = async (id) => { try { await authFetch(`/api/one-time-income/${id}`, { method: "DELETE" }); loadData(); } catch {} };

  const monthlyObligations = bills.reduce((s, b) => s + Number(b.amount || 0), 0);

  return (
    <div className="bills-income-page">
      <h1>Bills & Income</h1>

      <div className="bi-summary-bar">
        <span>Total monthly payments</span>
        <strong style={{ color: "var(--red)" }}>{currency.format(monthlyObligations)}</strong>
      </div>

      <div className="bi-two-col">
        {/* Income */}
        <section className="bi-section">
          <div className="bi-section-head"><h2>Income</h2><Link to="/app/income" className="primary-button">Manage</Link></div>
          {sources.length > 0 && (
            <>
              <p className="bi-sub-label">Recurring</p>
              <div className="recurring-list">
                {sources.map((s) => (
                  <div key={s._id} className="recurring-card">
                    <div><p className="entry-title">{s.name}{s.isPrimary && <span className="pill primary-pill">Primary</span>}</p><p className="muted">{formatFrequency(s.frequency)} &middot; Next: {formatDate(s.nextPayDate)}</p></div>
                    <span className="entry-amount positive">{currency.format(s.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {oneTimeIncomes.length > 0 && (
            <>
              <p className="bi-sub-label" style={{ marginTop: "0.65rem" }}>One-time income</p>
              <div className="recurring-list">
                {oneTimeIncomes.map((ot) => (
                  <div key={ot._id} className="recurring-card">
                    <div><p className="entry-title" style={{ color: "#8B5CF6" }}>{ot.name}</p><p className="muted">{formatDate(ot.date)}</p></div>
                    <div className="recurring-actions">
                      <span className="entry-amount" style={{ color: "#8B5CF6" }}>{currency.format(ot.amount)}</span>
                      <button type="button" className="bill-icon-btn" onClick={() => handleDeleteOneTime(ot._id)} title="Remove">x</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {sources.length === 0 && oneTimeIncomes.length === 0 && <p className="empty-row">No income sources yet.</p>}
        </section>

        {/* Bills */}
        <section className="bi-section">
          <div className="bi-section-head"><h2>Bills</h2><button type="button" className="primary-button" onClick={openAddBill}>Add bill</button></div>
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
                    <p className="muted">Day {b.dueDayOfMonth} &middot; {b.category}</p>
                  </div>
                  <div className="bill-card-right">
                    <span className="entry-amount negative">{currency.format(b.amount)}</span>
                    <div className="bill-card-actions">
                      <button type="button" className="bill-icon-btn" onClick={() => openEditBill(b)} title="Edit">E</button>
                      <button type="button" className="bill-icon-btn bill-icon-del" onClick={() => handleDeleteBill(b._id)} title="Remove">x</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="bi-section"><SavingsPanel /></section>

      {/* Add/Edit bill modal */}
      {showBillModal && (
        <div className="modal-overlay" onClick={() => { setShowBillModal(false); setEditingBill(null); }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h4>{editingBill ? "Edit bill" : "Add bill"}</h4><button type="button" className="ghost-button" onClick={() => { setShowBillModal(false); setEditingBill(null); }}>x</button></div>
            <form className="modal-form" onSubmit={handleSaveBill}>
              <label>Name<input value={billForm.name} onChange={(e) => setBillForm((p) => ({ ...p, name: e.target.value }))} required /></label>
              <label>Amount<input type="number" step="0.01" value={billForm.amount} onChange={(e) => setBillForm((p) => ({ ...p, amount: e.target.value }))} required /></label>
              <label>Due day of month<input type="number" min="1" max="31" value={billForm.dueDay} onChange={(e) => setBillForm((p) => ({ ...p, dueDay: e.target.value }))} required /></label>
              <label>Category<select value={billForm.category} onChange={(e) => setBillForm((p) => ({ ...p, category: e.target.value }))}>{BILL_CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label>Start date (optional)<input type="date" value={billForm.startDate} onChange={(e) => setBillForm((p) => ({ ...p, startDate: e.target.value }))} /><span className="muted" style={{ fontSize: "0.68rem" }}>When did this bill start?</span></label>
              <label>End date (optional)<input type="date" value={billForm.lastPaymentDate} onChange={(e) => setBillForm((p) => ({ ...p, lastPaymentDate: e.target.value }))} /><span className="muted" style={{ fontSize: "0.68rem" }}>When does this bill end? (e.g. payment plan)</span></label>
              <label>Final payment amount (optional)<input type="number" step="0.01" value={billForm.lastPaymentAmount} onChange={(e) => setBillForm((p) => ({ ...p, lastPaymentAmount: e.target.value }))} placeholder="If different from regular amount" /></label>
              <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => { setShowBillModal(false); setEditingBill(null); }}>Cancel</button><button type="submit" className="primary-button">{editingBill ? "Save changes" : "Add bill"}</button></div>
            </form>
          </div>
        </div>
      )}

      {limitModal && <FreeLimitModal type={limitModal} onClose={() => setLimitModal(null)} />}
    </div>
  );
};

export default BillsIncome;
