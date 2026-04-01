import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../apiClient";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const FREQ_OPTIONS = [
  { value: "weekly", label: "Every week" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "twicemonthly", label: "Twice a month (1st & 15th)" },
  { value: "monthly", label: "Once a month" },
];

const BILL_CATS = ["Car Payment", "Gym", "Insurance", "Internet", "Phone", "Rent", "Subscriptions", "Utilities", "Other"];

const Onboarding = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  // Step 2 — income
  const [income, setIncome] = useState({ name: "Primary Job", amount: "", frequency: "biweekly", nextPayDate: "" });

  // Step 3 — bills
  const [bills, setBills] = useState([]);
  const [billForm, setBillForm] = useState({ name: "", amount: "", dueDay: "", category: "Other" });

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

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
        await authFetch("/api/income-sources", {
          method: "POST",
          body: JSON.stringify({ name: income.name, amount: Number(income.amount), frequency: income.frequency, nextPayDate: income.nextPayDate, isPrimary: true }),
        });
      } catch (err) {
        if (!err.message?.includes("duplicate")) { setError("Failed to save income."); setSaving(false); return; }
      }
      setSaving(false);
    }
    if (step === 3) {
      setSaving(true);
      try {
        for (const bill of bills) {
          await authFetch("/api/bills", {
            method: "POST",
            body: JSON.stringify({ name: bill.name, amount: bill.amount, dueDayOfMonth: bill.dueDay, category: bill.category }),
          });
        }
      } catch (err) { setError("Failed to save bills."); setSaving(false); return; }
      setSaving(false);
    }
    setStep((s) => s + 1);
  };

  const handleFinish = async () => {
    setSaving(true);
    setError("");
    try {
      // Mark onboarding complete FIRST
      await authFetch("/api/user/complete-onboarding", { method: "POST" });
      // Fetch updated profile and save to localStorage
      const updated = await authFetch("/api/user/me");
      localStorage.setItem("user", JSON.stringify(updated));
      // Navigate to dashboard
      navigate("/app", { replace: true });
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // Step 4 balance — use ONLY data from this onboarding session, not DB
  const paycheckAmt = Number(income.amount) || 0;
  const sessionBillsTotal = bills.reduce((s, b) => s + b.amount, 0);
  const realBalance = paycheckAmt - sessionBillsTotal;

  return (
    <div className="onboarding-page">
      {/* Logout link */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.25rem" }}>
        <button type="button" onClick={handleLogout} style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--text-muted)", fontSize: "0.75rem", padding: 0,
        }}>
          Log out
        </button>
      </div>

      {/* Progress */}
      <div className="ob-progress">
        <div className="ob-progress-bar"><div className="ob-progress-fill" style={{ width: `${(step / 4) * 100}%` }} /></div>
        <span className="ob-step-label">Step {step} of 4</span>
      </div>

      {/* Step 1 — Welcome */}
      {step === 1 && (
        <div className="ob-step ob-welcome">
          <h1>Welcome{user.firstName ? `, ${user.firstName}` : ""}!</h1>
          <p className="ob-subtitle">It only takes 2 minutes. We just need a few things to show you your real balance.</p>
          <button type="button" className="primary-button ob-cta" onClick={() => setStep(2)}>Let's go &rarr;</button>
        </div>
      )}

      {/* Step 2 — Paycheck */}
      {step === 2 && (
        <div className="ob-step">
          <h2>How much do you get paid?</h2>
          <div className="ob-form">
            <label>Paycheck amount
              <input type="number" step="0.01" placeholder="0.00" value={income.amount} onChange={(e) => setIncome((p) => ({ ...p, amount: e.target.value }))} />
            </label>
            <label>How often?
              <div className="ob-pills">
                {FREQ_OPTIONS.map((f) => (
                  <button key={f.value} type="button" className={`ob-pill${income.frequency === f.value ? " active" : ""}`} onClick={() => setIncome((p) => ({ ...p, frequency: f.value }))}>{f.label}</button>
                ))}
              </div>
            </label>
            <label>When is your next payday?
              <input type="date" value={income.nextPayDate} onChange={(e) => setIncome((p) => ({ ...p, nextPayDate: e.target.value }))} />
            </label>
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
          <div className="ob-bill-form">
            <input placeholder="Bill name" value={billForm.name} onChange={(e) => setBillForm((p) => ({ ...p, name: e.target.value }))} />
            <input type="number" step="0.01" placeholder="Amount" value={billForm.amount} onChange={(e) => setBillForm((p) => ({ ...p, amount: e.target.value }))} />
            <input type="number" min="1" max="31" placeholder="Day" value={billForm.dueDay} onChange={(e) => setBillForm((p) => ({ ...p, dueDay: e.target.value }))} />
            <select value={billForm.category} onChange={(e) => setBillForm((p) => ({ ...p, category: e.target.value }))}>
              {BILL_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="button" className="secondary-button" onClick={handleAddBill}>Add</button>
          </div>
          {bills.length > 0 && (
            <ul className="ob-bill-list">
              {bills.map((b, i) => (
                <li key={i}><span>{b.name}</span><span>{currency.format(b.amount)}</span>
                  <button type="button" className="ghost-button" onClick={() => setBills((prev) => prev.filter((_, j) => j !== i))}>x</button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="ob-error">{error}</p>}
          <div className="ob-actions">
            <button type="button" className="ghost-button" onClick={() => setStep(2)}>Back</button>
            <button type="button" className="link-button ob-skip" onClick={() => setStep(4)}>Skip for now</button>
            <button type="button" className="primary-button" onClick={handleNext} disabled={saving}>{saving ? "Saving..." : "Next"}</button>
          </div>
        </div>
      )}

      {/* Step 4 — All Set */}
      {step === 4 && (
        <div className="ob-step ob-done">
          <h2>All set!</h2>
          <div className="ob-snapshot">
            <p className="ob-snapshot-title">Here's your first paycheck snapshot:</p>
            <div className="ob-snapshot-row"><span>Paycheck</span><span>{currency.format(paycheckAmt)}</span></div>
            <div className="ob-snapshot-row negative"><span>Bills this period</span><span>&minus;{currency.format(sessionBillsTotal)}</span></div>
            <div className="ob-snapshot-row total"><span>Your real balance</span><span className="teal">{currency.format(realBalance)}</span></div>
          </div>
          <p className="ob-msg">That's what you actually have to spend. Not a dollar more.</p>
          {error && <p className="ob-error">{error}</p>}
          <button type="button" className="primary-button ob-cta" onClick={handleFinish} disabled={saving}>{saving ? "Setting up..." : "Go to my dashboard \u2192"}</button>
        </div>
      )}
    </div>
  );
};

export default Onboarding;
