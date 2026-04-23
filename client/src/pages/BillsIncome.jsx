import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { authFetch } from "../apiClient";
import { formatDate } from "../utils/dateUtils";
import { useIncomeSources } from "../hooks/useIncomeSources";
import { useSubscription } from "../hooks/useSubscription";
import { useDataCache } from "../context/DataCache";
import FreeLimitModal from "../components/FreeLimitModal";
import { currency } from "../utils/currency";

const formatFrequency = (f) => f === "biweekly" ? "Every two weeks" : f === "weekly" ? "Weekly" : f === "twicemonthly" ? "Twice a month, 1st and 15th" : f === "monthly" ? "Monthly" : f;
const BILL_CATS = ["Car Payment", "Gym", "Insurance", "Internet", "Phone", "Rent", "Subscriptions", "Utilities", "Other"];

const emptyForm = { name: "", amount: "", dueDay: "", category: "Other", startDate: "", lastPaymentDate: "", lastPaymentAmount: "" };

const BillsIncome = () => {
  const cache = useDataCache();
  const { sources } = useIncomeSources();
  const { isFree } = useSubscription();
  const [tab, setTab] = useState("income");

  const [bills, setBills] = useState([]);
  const [oneTimeIncomes, setOneTimeIncomes] = useState([]);
  const [savingsGoals, setSavingsGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBillModal, setShowBillModal] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [limitModal, setLimitModal] = useState(null);
  const [billForm, setBillForm] = useState({ ...emptyForm });

  // Savings state
  const [showAddSavings, setShowAddSavings] = useState(false);
  const [savForm, setSavForm] = useState({ name: "", amount: "" });
  const [savSaving, setSavSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [b, ot, sg] = await Promise.all([
        authFetch("/api/bills"),
        authFetch("/api/one-time-income").catch(() => []),
        authFetch("/api/savings-goals").catch(() => []),
      ]);
      setBills([...(b || [])].sort((a, b2) => (a.dueDayOfMonth || 0) - (b2.dueDayOfMonth || 0)));
      setOneTimeIncomes(Array.isArray(ot) ? ot : []);
      setSavingsGoals(Array.isArray(sg) ? sg : []);
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

  // ── Savings handlers ───────────────────────────────────────────────────────
  const handleAddSavings = async (e) => {
    e.preventDefault();
    const amt = Number(savForm.amount);
    if (!savForm.name || savForm.name.length < 2 || !amt || amt <= 0) return;
    setSavSaving(true);
    try {
      await authFetch("/api/savings-goals", {
        method: "POST",
        body: JSON.stringify({
          name: savForm.name,
          targetAmount: 999999,
          savedAmount: amt,
          perPaycheckAmount: 0,
          category: "Savings",
        }),
      });
      setSavForm({ name: "", amount: "" });
      setShowAddSavings(false);
      loadData();
      if (cache?.fetchSummary) cache.fetchSummary(true);
    } catch { /* ignore */ }
    finally { setSavSaving(false); }
  };

  const handleContributeSavings = async (goal) => {
    const input = window.prompt(`Add to "${goal.name}"`, "0");
    if (!input) return;
    const amount = Number(input);
    if (!amount || amount <= 0) return;
    try {
      await authFetch(`/api/savings-goals/${goal._id}/contribute`, { method: "POST", body: JSON.stringify({ amount }) });
      // Log as expense to deduct from spendable balance
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      await authFetch("/api/expenses", { method: "POST", body: JSON.stringify({ date: dateStr, amount, category: "Savings", description: `Savings — ${goal.name}` }) });
      loadData();
      if (cache?.fetchSummary) cache.fetchSummary(true);
    } catch { /* ignore */ }
  };

  const handleWithdrawSavings = async (goal) => {
    const input = window.prompt(`Withdraw from "${goal.name}" (max ${currency.format(goal.savedAmount || 0)})`, "0");
    if (!input) return;
    const amount = Number(input);
    if (!amount || amount <= 0 || amount > (goal.savedAmount || 0)) { alert("Invalid amount."); return; }
    try {
      await authFetch(`/api/savings-goals/${goal._id}/withdraw`, { method: "POST", body: JSON.stringify({ amount }) });
      // Log as one-time income so it appears on dashboard
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      await authFetch("/api/one-time-income", { method: "POST", body: JSON.stringify({ name: `Savings Withdrawal — ${goal.name}`, amount, date: dateStr }) });
      loadData();
      if (cache?.fetchSummary) cache.fetchSummary(true);
    } catch { /* ignore */ }
  };

  const handleDeleteSavings = async (id) => {
    if (!window.confirm("Delete this savings entry?")) return;
    try { await authFetch(`/api/savings-goals/${id}`, { method: "DELETE" }); loadData(); } catch { /* ignore */ }
  };

  const monthlyObligations = bills.reduce((s, b) => s + Number(b.amount || 0), 0);
  const totalSaved = savingsGoals.reduce((s, g) => s + (g.savedAmount || 0), 0);

  return (
    <div className="bills-income-page">
      <h1>Bills & Income</h1>

      <div className="bi-summary-bar">
        <span>Total monthly payments</span>
        <strong style={{ color: "var(--red)" }}>{currency.format(monthlyObligations)}</strong>
      </div>

      {/* Tabs */}
      <div className="bi-tabs">
        <button type="button" className={`bi-tab${tab === "income" ? " active" : ""}`} onClick={() => setTab("income")}>Income</button>
        <button type="button" className={`bi-tab${tab === "bills" ? " active" : ""}`} onClick={() => setTab("bills")}>Bills</button>
        <button type="button" className={`bi-tab${tab === "savings" ? " active" : ""}`} onClick={() => setTab("savings")}>Savings</button>
      </div>

      {/* ── INCOME TAB ─────────────────────────────────────────────────────── */}
      {tab === "income" && (
        <section className="bi-section">
          <div className="bi-section-head"><h2>Income</h2><Link to="/app/income" className="primary-button">Manage</Link></div>
          {sources.length > 0 && (
            <>
              <p className="bi-sub-label">Recurring</p>
              <div className="recurring-list">
                {sources.map((s) => (
                  <div key={s._id} className="recurring-card">
                    <div><p className="entry-title">{s.name}{s.isPrimary && <span className="pill primary-pill">Primary</span>}</p><p className="muted">{formatFrequency(s.frequency)}. Next pay {formatDate(s.nextPayDate)}</p></div>
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
      )}

      {/* ── BILLS TAB ──────────────────────────────────────────────────────── */}
      {tab === "bills" && (
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
                    <p className="muted">Due day {b.dueDayOfMonth}. {b.category}</p>
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
      )}

      {/* ── SAVINGS TAB ────────────────────────────────────────────────────── */}
      {tab === "savings" && (
        <section className="bi-section">
          <div className="bi-section-head">
            <div>
              <h2>Savings</h2>
              {savingsGoals.length > 0 && <p className="muted" style={{ margin: "0.15rem 0 0", fontSize: "0.78rem" }}>Total saved: {currency.format(totalSaved)}</p>}
            </div>
            <button type="button" className="primary-button" onClick={() => setShowAddSavings(true)}>Add Savings</button>
          </div>
          {loading ? <p className="status">Loading...</p> : savingsGoals.length === 0 ? (
            <p className="empty-row">No savings yet. Start saving today.</p>
          ) : (
            <div className="recurring-list">
              {savingsGoals.map((g) => (
                <div key={g._id} className="recurring-card">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="entry-title">{g.name}</p>
                    <p className="muted">Current balance: {currency.format(g.savedAmount || 0)}</p>
                  </div>
                  <div className="recurring-actions">
                    <button type="button" className="secondary-button savings-plus-btn" onClick={() => handleContributeSavings(g)} title="Add">+ Add</button>
                    {(g.savedAmount || 0) > 0 && (
                      <button type="button" className="ghost-button savings-minus-btn" onClick={() => handleWithdrawSavings(g)} title="Withdraw">- Withdraw</button>
                    )}
                    <button type="button" className="bill-icon-btn bill-icon-del" onClick={() => handleDeleteSavings(g._id)} title="Delete">x</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

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

      {/* Add savings modal */}
      {showAddSavings && (
        <div className="modal-overlay" onClick={() => setShowAddSavings(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h4>Add savings</h4><button type="button" className="ghost-button" onClick={() => setShowAddSavings(false)}>&#x2715;</button></div>
            <form className="modal-form" onSubmit={handleAddSavings}>
              <label>Name<input value={savForm.name} onChange={(e) => setSavForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Vacation, Emergency fund" required /></label>
              <label>Starting amount<input type="number" step="0.01" min="0" value={savForm.amount} onChange={(e) => setSavForm((p) => ({ ...p, amount: e.target.value }))} required /></label>
              <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setShowAddSavings(false)}>Cancel</button><button type="submit" className="primary-button" disabled={savSaving}>{savSaving ? "..." : "Save"}</button></div>
            </form>
          </div>
        </div>
      )}

      {limitModal && <FreeLimitModal type={limitModal} onClose={() => setLimitModal(null)} />}
    </div>
  );
};

export default BillsIncome;
