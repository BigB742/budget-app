import { useState } from "react";
import { authFetch } from "../apiClient";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const FREQ_OPTIONS = [
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "twicemonthly", label: "Twice a month (1st & 15th)" },
  { value: "monthly", label: "Once a month" },
];

const BILL_CATS = ["Car Payment", "Gym", "Insurance", "Internet", "Phone", "Rent", "Subscriptions", "Utilities", "Other"];
const TOTAL_STEPS = 6;

const Onboarding = () => {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const [income, setIncome] = useState({ name: "Primary Job", amount: "", frequency: "biweekly", nextPayDate: "" });
  const [bills, setBills] = useState([]);
  const [billForm, setBillForm] = useState({ name: "", amount: "", dueDay: "", category: "Other" });
  const [bankBalance, setBankBalance] = useState("");

  const handleLogout = () => { localStorage.removeItem("token"); localStorage.removeItem("user"); window.location.href = "/login"; };

  const handleAddBill = () => {
    if (!billForm.name || !billForm.amount || !billForm.dueDay) return;
    setBills((prev) => [...prev, { ...billForm, amount: Number(billForm.amount), dueDay: Number(billForm.dueDay) }]);
    setBillForm({ name: "", amount: "", dueDay: "", category: "Other" });
  };

  const handleNext = async () => {
    setError("");
    if (step === 2) {
      if (!income.amount || !income.nextPayDate) { setError("Please fill in your paycheck details."); return; }
      setSaving(true);
      try {
        await authFetch("/api/income-sources", { method: "POST", body: JSON.stringify({ name: income.name, amount: Number(income.amount), frequency: income.frequency, nextPayDate: income.nextPayDate, isPrimary: true }) });
      } catch (err) { if (!err.message?.includes("duplicate")) { setError("Failed to save income."); setSaving(false); return; } }
      setSaving(false);
    }
    if (step === 3) {
      setSaving(true);
      try {
        for (const bill of bills) {
          await authFetch("/api/bills", { method: "POST", body: JSON.stringify({ name: bill.name, amount: bill.amount, dueDayOfMonth: bill.dueDay, category: bill.category }) });
        }
      } catch { setError("Failed to save bills."); setSaving(false); return; }
      setSaving(false);
    }
    if (step === 4) {
      if (!bankBalance) { setError("Please enter your current balance."); return; }
      setSaving(true);
      try {
        await authFetch("/api/user/me", { method: "PUT", body: JSON.stringify({ currentBalance: Number(bankBalance) }) });
      } catch { /* non-critical */ }
      setSaving(false);
    }
    setStep((s) => s + 1);
  };

  const handleSubscribe = async (plan) => {
    setSaving(true);
    try {
      const data = await authFetch("/api/stripe/create-checkout-session", { method: "POST", body: JSON.stringify({ plan }) });
      if (data.url) { await finishOnboarding(); window.location.href = data.url; return; }
    } catch { setError("Subscription setup failed. You can upgrade later from Settings."); }
    setSaving(false);
  };

  const finishOnboarding = async () => {
    try {
      await authFetch("/api/user/complete-onboarding", { method: "POST" });
      const updated = await authFetch("/api/user/me");
      localStorage.setItem("user", JSON.stringify(updated));
    } catch { /* non-critical */ }
  };

  const handleSkipAndFinish = async () => {
    setSaving(true);
    await finishOnboarding();
    window.location.href = "/app";
  };

  const handleFinish = async () => {
    setSaving(true);
    await finishOnboarding();
    window.location.href = "/app";
  };

  const paycheckAmt = Number(income.amount) || 0;
  const sessionBillsTotal = bills.reduce((s, b) => s + b.amount, 0);
  const bal = Number(bankBalance) || 0;
  const realBalance = bal > 0 ? bal - sessionBillsTotal : paycheckAmt - sessionBillsTotal;

  return (
    <div className="onboarding-page">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.25rem" }}>
        <button type="button" onClick={handleLogout} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "0.75rem", padding: 0 }}>Log out</button>
      </div>

      <div className="ob-progress">
        <div className="ob-progress-bar"><div className="ob-progress-fill" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} /></div>
        <span className="ob-step-label">Step {step} of {TOTAL_STEPS}</span>
      </div>

      {/* Step 1 — Welcome */}
      {step === 1 && (
        <div className="ob-step ob-welcome">
          <h1>Welcome{user.firstName ? `, ${user.firstName}` : ""}!</h1>
          <p className="ob-subtitle">It only takes 2 minutes. We just need a few things to show you your real balance.</p>
          <button type="button" className="primary-button ob-cta" onClick={() => setStep(2)}>Let's go</button>
        </div>
      )}

      {/* Step 2 — Paycheck */}
      {step === 2 && (
        <div className="ob-step">
          <h2>How much do you get paid?</h2>
          <div className="ob-form">
            <label>Paycheck amount<input type="number" step="0.01" placeholder="0.00" value={income.amount} onChange={(e) => setIncome((p) => ({ ...p, amount: e.target.value }))} /></label>
            <label>How often?
              <div className="ob-pills">
                {FREQ_OPTIONS.map((f) => (<button key={f.value} type="button" className={`ob-pill${income.frequency === f.value ? " active" : ""}`} onClick={() => setIncome((p) => ({ ...p, frequency: f.value }))}>{f.label}</button>))}
              </div>
            </label>
            <label>When is your next payday?<input type="date" value={income.nextPayDate} onChange={(e) => setIncome((p) => ({ ...p, nextPayDate: e.target.value }))} /></label>
          </div>
          {error && <p className="ob-error">{error}</p>}
          <div className="ob-actions">
            <button type="button" className="ghost-button" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="primary-button" onClick={handleNext} disabled={saving}>{saving ? "Saving..." : "Next"}</button>
          </div>
        </div>
      )}

      {/* Step 3 — Bills */}
      {step === 3 && (
        <div className="ob-step">
          <h2>Add your regular bills</h2>
          <p className="ob-subtitle">Things you pay every month — rent, phone, subscriptions. You can always add more later.</p>
          <div className="ob-bill-form-v2">
            <div className="ob-bill-row">
              <label className="ob-bill-field ob-bill-field-wide">Bill name<input placeholder="e.g. Rent, Verizon" value={billForm.name} onChange={(e) => setBillForm((p) => ({ ...p, name: e.target.value }))} /></label>
              <label className="ob-bill-field">Amount<input type="number" step="0.01" placeholder="0.00" value={billForm.amount} onChange={(e) => setBillForm((p) => ({ ...p, amount: e.target.value }))} /></label>
            </div>
            <div className="ob-bill-row">
              <label className="ob-bill-field">Due day<input type="number" min="1" max="31" placeholder="1-31" value={billForm.dueDay} onChange={(e) => setBillForm((p) => ({ ...p, dueDay: e.target.value }))} /></label>
              <label className="ob-bill-field ob-bill-field-wide">Category<select value={billForm.category} onChange={(e) => setBillForm((p) => ({ ...p, category: e.target.value }))}>{BILL_CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
            </div>
            <button type="button" className="primary-button" style={{ width: "100%" }} onClick={handleAddBill}>+ Add bill</button>
          </div>
          {bills.length > 0 && (
            <div className="ob-bill-list-v2">
              {bills.map((b, i) => (
                <div key={i} className="ob-bill-card">
                  <div><span className="ob-bill-card-name">{b.name}</span><span className="ob-bill-card-meta">Day {b.dueDay} &middot; {b.category}</span></div>
                  <div className="ob-bill-card-right"><span className="ob-bill-card-amt">{currency.format(b.amount)}</span><button type="button" className="bill-icon-btn bill-icon-del" onClick={() => setBills((prev) => prev.filter((_, j) => j !== i))}>x</button></div>
                </div>
              ))}
            </div>
          )}
          {error && <p className="ob-error">{error}</p>}
          <div className="ob-actions">
            <button type="button" className="ghost-button" onClick={() => setStep(2)}>Back</button>
            <button type="button" className="link-button ob-skip" onClick={() => setStep(4)}>Skip for now</button>
            <button type="button" className="primary-button" onClick={handleNext} disabled={saving}>{saving ? "Saving..." : "Next"}</button>
          </div>
        </div>
      )}

      {/* Step 4 — Current Bank Balance */}
      {step === 4 && (
        <div className="ob-step">
          <h2>What's your current bank balance?</h2>
          <p className="ob-subtitle">This is what you actually have right now — not what you're expecting. We'll use this as your real starting point.</p>
          <div className="ob-form">
            <label>Current balance
              <input type="number" step="0.01" placeholder="0.00" value={bankBalance} onChange={(e) => setBankBalance(e.target.value)} style={{ fontSize: "1.5rem", textAlign: "center", fontWeight: 700 }} />
            </label>
          </div>
          {error && <p className="ob-error">{error}</p>}
          <div className="ob-actions">
            <button type="button" className="ghost-button" onClick={() => setStep(3)}>Back</button>
            <button type="button" className="primary-button" onClick={handleNext} disabled={saving}>{saving ? "Saving..." : "Next"}</button>
          </div>
        </div>
      )}

      {/* Step 5 — Subscription Choice */}
      {step === 5 && (
        <div className="ob-step">
          <h2>Unlock PayPulse Premium?</h2>
          <p className="ob-subtitle">Get unlimited bills, 12-month projections, and spending insights.</p>
          <div className="sub-plans" style={{ marginBottom: "1rem" }}>
            <div className="sub-plan-card" style={{ minWidth: "auto", maxWidth: "none", flex: 1 }}>
              <h3>Monthly</h3>
              <p className="sub-price">$4.99<span>/month</span></p>
              <p className="sub-trial-note">3-day free trial included</p>
              <button type="button" className="primary-button" style={{ width: "100%" }} onClick={() => handleSubscribe("monthly")} disabled={saving}>Start free trial</button>
            </div>
            <div className="sub-plan-card sub-plan-best" style={{ minWidth: "auto", maxWidth: "none", flex: 1 }}>
              <div className="sub-best-badge">Best value</div>
              <h3>Annual</h3>
              <p className="sub-price">$39.99<span>/year</span></p>
              <p className="sub-savings">Save 33% vs monthly</p>
              <button type="button" className="primary-button" style={{ width: "100%" }} onClick={() => handleSubscribe("annual")} disabled={saving}>Get annual</button>
            </div>
          </div>
          {error && <p className="ob-error">{error}</p>}
          <div className="ob-actions" style={{ justifyContent: "center" }}>
            <button type="button" className="ghost-button" onClick={() => setStep(4)}>Back</button>
            <button type="button" className="link-button ob-skip" onClick={() => setStep(6)}>Skip — continue with Free plan</button>
          </div>
        </div>
      )}

      {/* Step 6 — All Set */}
      {step === 6 && (
        <div className="ob-step ob-done">
          <h2>All set!</h2>
          <div className="ob-snapshot">
            <p className="ob-snapshot-title">Here's your first paycheck snapshot:</p>
            <div className="ob-snapshot-row"><span>Current balance</span><span>{currency.format(bal || paycheckAmt)}</span></div>
            <div className="ob-snapshot-row negative"><span>Bills this period</span><span>&minus;{currency.format(sessionBillsTotal)}</span></div>
            <div className="ob-snapshot-row total"><span>Your real balance</span><span className="teal">{currency.format(realBalance)}</span></div>
          </div>
          <p className="ob-msg">That's what you actually have to spend. Not a dollar more.</p>
          {error && <p className="ob-error">{error}</p>}
          <button type="button" className="primary-button ob-cta" onClick={handleFinish} disabled={saving}>{saving ? "Setting up..." : "Go to my dashboard"}</button>
        </div>
      )}
    </div>
  );
};

export default Onboarding;
