import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { authFetch } from "../apiClient";
import { formatDate } from "../utils/dateUtils";
import { useIncomeSources } from "../hooks/useIncomeSources";
import SavingsPanel from "../components/SavingsPanel";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const formatFrequency = (f) => f === "biweekly" ? "Bi-weekly" : f === "weekly" ? "Weekly" : f === "twicemonthly" ? "1st & 15th" : f === "monthly" ? "Monthly" : f;
const BILL_CATS = ["Rent", "Utilities", "Subscriptions", "Car Payment", "Insurance", "Phone", "Internet", "Other"];

const BillsIncome = () => {
  const { sources } = useIncomeSources();
  const [bills, setBills] = useState([]);
  const [oneTimeIncomes, setOneTimeIncomes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBillModal, setShowBillModal] = useState(false);
  const [billForm, setBillForm] = useState({ name: "", amount: "", dueDay: "", category: "Other", lastPaymentDate: "", lastPaymentAmount: "" });

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

  const handleAddBill = async (e) => {
    e.preventDefault();
    try {
      await authFetch("/api/bills", { method: "POST", body: JSON.stringify({ name: billForm.name, amount: Number(billForm.amount), dueDayOfMonth: Number(billForm.dueDay), category: billForm.category, lastPaymentDate: billForm.lastPaymentDate || null, lastPaymentAmount: billForm.lastPaymentAmount ? Number(billForm.lastPaymentAmount) : null }) });
      setBillForm({ name: "", amount: "", dueDay: "", category: "Other", lastPaymentDate: "", lastPaymentAmount: "" });
      setShowBillModal(false);
      loadData();
    } catch { /* ignore */ }
  };

  const handleDeleteBill = async (id) => { try { await authFetch(`/api/bills/${id}`, { method: "DELETE" }); loadData(); } catch {} };
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
                      <button type="button" className="ghost-button" onClick={() => handleDeleteOneTime(ot._id)}>x</button>
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
          <div className="bi-section-head"><h2>Bills</h2><button type="button" className="primary-button" onClick={() => setShowBillModal(true)}>Add bill</button></div>
          {loading ? <p className="status">Loading...</p> : bills.length === 0 ? <p className="empty-row">No bills yet.</p> : (
            <div className="recurring-list">
              {bills.map((b) => (
                <div key={b._id} className="recurring-card">
                  <div><p className="entry-title">{b.name}{b.lastPaymentDate && <span className="pill ends-pill">Ends {formatDate(b.lastPaymentDate)}</span>}</p><p className="muted">Day {b.dueDayOfMonth} &middot; {b.category}</p></div>
                  <div className="recurring-actions"><span className="entry-amount negative">{currency.format(b.amount)}</span><button type="button" className="ghost-button" onClick={() => handleDeleteBill(b._id)}>Remove</button></div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* COMING SOON — Debt payoff tracker. Full feature in next development phase. */}
      {/* <section className="bi-section"><DebtPanel /></section> */}

      {/* Savings */}
      <section className="bi-section"><SavingsPanel /></section>

      {/* COMING SOON — Crypto tracking. Full feature in next development phase. */}
      {/* <section className="bi-section"><CryptoPanel /></section> */}

      {showBillModal && (
        <div className="modal-overlay" onClick={() => setShowBillModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h4>Add bill</h4><button type="button" className="ghost-button" onClick={() => setShowBillModal(false)}>&#x2715;</button></div>
            <form className="modal-form" onSubmit={handleAddBill}>
              <label>Name<input value={billForm.name} onChange={(e) => setBillForm((p) => ({ ...p, name: e.target.value }))} required /></label>
              <label>Amount<input type="number" step="0.01" value={billForm.amount} onChange={(e) => setBillForm((p) => ({ ...p, amount: e.target.value }))} required /></label>
              <label>Due day of month<input type="number" min="1" max="31" value={billForm.dueDay} onChange={(e) => setBillForm((p) => ({ ...p, dueDay: e.target.value }))} required /></label>
              <label>Category<select value={billForm.category} onChange={(e) => setBillForm((p) => ({ ...p, category: e.target.value }))}>{BILL_CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label>Last payment date (optional)<input type="date" value={billForm.lastPaymentDate} onChange={(e) => setBillForm((p) => ({ ...p, lastPaymentDate: e.target.value }))} /></label>
              <label>Last payment amount (optional)<input type="number" step="0.01" value={billForm.lastPaymentAmount} onChange={(e) => setBillForm((p) => ({ ...p, lastPaymentAmount: e.target.value }))} /></label>
              <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setShowBillModal(false)}>Cancel</button><button type="submit" className="primary-button">Save bill</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BillsIncome;
