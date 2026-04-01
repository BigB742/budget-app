import { useState, useEffect, useCallback } from "react";
import { authFetch } from "../apiClient";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const calcPayoff = (balance, apr, payment, extraMonthly = 0) => {
  if (balance <= 0 || payment <= 0) return { months: 0, totalInterest: 0 };
  const monthlyPayment = payment + extraMonthly;
  if (apr <= 0) {
    const months = Math.ceil(balance / monthlyPayment);
    return { months, totalInterest: 0 };
  }
  const r = apr / 100 / 12;
  if (monthlyPayment <= balance * r) return { months: Infinity, totalInterest: Infinity };
  const n = Math.ceil(-Math.log(1 - (r * balance / monthlyPayment)) / Math.log(1 + r));
  const totalInterest = (monthlyPayment * n) - balance;
  return { months: n, totalInterest: Math.max(0, totalInterest) };
};

const formatPayoffDate = (months) => {
  if (!months || months === Infinity) return "Never (increase payment)";
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const DebtPanel = () => {
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", originalBalance: "", currentBalance: "", interestRate: "", minimumPayment: "", dueDayOfMonth: "" });
  const [saving, setSaving] = useState(false);
  const [extraInputs, setExtraInputs] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await authFetch("/api/debts"); setDebts(Array.isArray(d) ? d : []); } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await authFetch("/api/debts", { method: "POST", body: JSON.stringify({
        name: form.name, originalBalance: Number(form.originalBalance), currentBalance: Number(form.currentBalance || form.originalBalance),
        interestRate: Number(form.interestRate) || 0, minimumPayment: Number(form.minimumPayment), dueDayOfMonth: Number(form.dueDayOfMonth),
      })});
      setForm({ name: "", originalBalance: "", currentBalance: "", interestRate: "", minimumPayment: "", dueDayOfMonth: "" });
      setShowAdd(false);
      load();
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const handlePayment = async (debt) => {
    const input = window.prompt(`Payment amount for "${debt.name}"`, String(debt.minimumPayment));
    if (!input) return;
    try { await authFetch(`/api/debts/${debt._id}/payment`, { method: "POST", body: JSON.stringify({ amount: Number(input) }) }); load(); } catch { /* ignore */ }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this debt?")) return;
    try { await authFetch(`/api/debts/${id}`, { method: "DELETE" }); load(); } catch { /* ignore */ }
  };

  return (
    <div className="recurring-section" style={{ borderBottom: "none" }}>
      <div className="recurring-section-header">
        <h4>Debts</h4>
        <button type="button" className="primary-button" onClick={() => setShowAdd(true)}>Add debt</button>
      </div>

      {loading ? <p className="status">Loading...</p> : debts.length === 0 ? (
        <p className="empty-row">No debts tracked.</p>
      ) : (
        <div className="recurring-list">
          {debts.map((debt) => {
            const paidOff = (debt.originalBalance || 0) - (debt.currentBalance || 0);
            const pctPaid = debt.originalBalance > 0 ? Math.round((paidOff / debt.originalBalance) * 100) : 0;
            const extra = Number(extraInputs[debt._id]) || 0;
            const payoff = calcPayoff(debt.currentBalance, debt.interestRate || 0, debt.minimumPayment, extra);
            const basePayoff = calcPayoff(debt.currentBalance, debt.interestRate || 0, debt.minimumPayment, 0);

            return (
              <div key={debt._id} className="debt-card">
                <div className="debt-header">
                  <div>
                    <p className="entry-title">{debt.name}</p>
                    <p style={{ fontSize: "1.15rem", fontWeight: 700, margin: "0.15rem 0 0", color: "var(--red)" }}>{currency.format(debt.currentBalance)}</p>
                  </div>
                  <div className="recurring-actions">
                    <button type="button" className="secondary-button" onClick={() => handlePayment(debt)}>Pay</button>
                    <button type="button" className="ghost-button" onClick={() => handleDelete(debt._id)}>x</button>
                  </div>
                </div>

                <div className="progress-bar" style={{ margin: "0.5rem 0 0.25rem" }}><div className="progress-bar-fill" style={{ width: `${pctPaid}%` }} /></div>
                <p className="muted">{currency.format(paidOff)} paid of {currency.format(debt.originalBalance)} ({pctPaid}%)</p>

                <div className="debt-details">
                  <span>Payment: {currency.format(debt.minimumPayment)}/mo</span>
                  {debt.interestRate > 0 && <span>APR: {debt.interestRate}%</span>}
                  <span>Due day: {debt.dueDayOfMonth}</span>
                </div>

                {/* Payoff projections */}
                <div className="debt-projection">
                  <p className="debt-projection-note">PayPulse calculates this automatically</p>
                  <div className="debt-projection-row"><span>Payoff date</span><span>{formatPayoffDate(payoff.months)}</span></div>
                  {debt.interestRate > 0 && <div className="debt-projection-row"><span>Total interest</span><span style={{ color: "var(--red)" }}>{currency.format(payoff.totalInterest)}</span></div>}

                  {/* Extra payment simulator */}
                  <div className="debt-extra">
                    <label>What if I pay extra per month?
                      <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                        <span>$</span>
                        <input type="number" min="0" step="1" value={extraInputs[debt._id] || ""} onChange={(e) => setExtraInputs((p) => ({ ...p, [debt._id]: e.target.value }))} placeholder="0" className="debt-extra-input" />
                      </div>
                    </label>
                    {extra > 0 && (
                      <div className="debt-extra-result">
                        <span>New payoff: {formatPayoffDate(payoff.months)}</span>
                        {debt.interestRate > 0 && basePayoff.totalInterest > payoff.totalInterest && (
                          <span style={{ color: "var(--teal)" }}>Save {currency.format(basePayoff.totalInterest - payoff.totalInterest)} in interest</span>
                        )}
                        {basePayoff.months > payoff.months && (
                          <span style={{ color: "var(--teal)" }}>Pay off {basePayoff.months - payoff.months} months sooner</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h4>Add debt</h4><button type="button" className="ghost-button" onClick={() => setShowAdd(false)}>&#x2715;</button></div>
            <form className="modal-form" onSubmit={handleAdd}>
              <label>Name<input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Best Buy, Car loan" required /></label>
              <label>Original balance<input type="number" step="0.01" value={form.originalBalance} onChange={(e) => setForm((p) => ({ ...p, originalBalance: e.target.value }))} required /></label>
              <label>Current balance<input type="number" step="0.01" value={form.currentBalance} onChange={(e) => setForm((p) => ({ ...p, currentBalance: e.target.value }))} placeholder="Same as original if new" /></label>
              <label>APR / Interest rate (%)<input type="number" step="0.01" value={form.interestRate} onChange={(e) => setForm((p) => ({ ...p, interestRate: e.target.value }))} placeholder="0 if no interest" /></label>
              <label>Minimum monthly payment<input type="number" step="0.01" value={form.minimumPayment} onChange={(e) => setForm((p) => ({ ...p, minimumPayment: e.target.value }))} required /></label>
              <label>Due day of month<input type="number" min="1" max="31" value={form.dueDayOfMonth} onChange={(e) => setForm((p) => ({ ...p, dueDayOfMonth: e.target.value }))} required /></label>
              <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setShowAdd(false)}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "..." : "Save debt"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DebtPanel;
