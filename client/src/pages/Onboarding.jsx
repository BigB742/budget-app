import { useState } from "react";
import { authFetch } from "../apiClient";
import { storeUser } from "../utils/safeStorage";

const FREQ_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "twicemonthly", label: "Semi-Monthly" },
  { value: "monthly", label: "Monthly" },
];

const TOTAL_STEPS = 9;

const Onboarding = () => {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const user = (() => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } })();

  // Step 2 — Income Type
  const [incomeType, setIncomeType] = useState("");

  // Step 3 — Pay Frequency
  const [frequency, setFrequency] = useState("");

  // Step 4 — Income Amount
  const [incomeAmount, setIncomeAmount] = useState("");
  const [nextPayDate, setNextPayDate] = useState("");
  const [incomeError, setIncomeError] = useState("");
  const [incomeSaved, setIncomeSaved] = useState(false);

  // Step 5 — Bank Balance (or payday-today smart screen)
  const [bankBalance, setBankBalance] = useState("");
  const [balanceSaved, setBalanceSaved] = useState(false);
  // payday-today smart screen state
  const [paydayIsToday, setPaydayIsToday] = useState(false);
  const [paydayTodayChoice, setPaydayTodayChoice] = useState(""); // "extra" | "fresh" | "overdrawn"
  const [paydayTodayAmount, setPaydayTodayAmount] = useState("");
  const [paydayTodayError, setPaydayTodayError] = useState("");

  // Step 6 — Savings
  const [savings, setSavings] = useState("");
  const [savingsSaved, setSavingsSaved] = useState(false);

  // Steps 7 & 8 — Bills
  const [bill1, setBill1] = useState({ name: "", amount: "", dueDay: "" });
  const [bill1Error, setBill1Error] = useState("");
  const [bill1Saved, setBill1Saved] = useState(false);
  const [bill2, setBill2] = useState({ name: "", amount: "", dueDay: "" });
  const [bill2Error, setBill2Error] = useState("");
  const [bill2Saved, setBill2Saved] = useState(false);

  const anythingSkipped = !incomeSaved || (!bill1Saved && !bill2Saved);

  const finishOnboarding = async () => {
    setSaving(true);
    try {
      const updated = await authFetch("/api/user/complete-onboarding", { method: "POST" });
      storeUser(updated);
    } catch { /* non-critical */ }
    window.location.href = "/app";
  };

  // ── Step 1 — Welcome ─────────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="onboarding-page">
        <ProgressBar step={step} />
        <div className="ob-step ob-welcome">
          <h1>Welcome to PayPulse{user.firstName ? `, ${user.firstName}` : ""}!</h1>
          <p className="ob-subtitle">Let's get your finances set up in 2 minutes.</p>
          <button type="button" className="primary-button ob-cta" onClick={() => setStep(2)}>
            Let's go →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2 — Income Type ─────────────────────────────────────────────────────
  if (step === 2) {
    const handleSelect = async (type) => {
      setIncomeType(type);
      try {
        await authFetch("/api/user/me", {
          method: "PUT",
          body: JSON.stringify({ incomeType: type }),
        });
        const stored = JSON.parse(localStorage.getItem("user") || "{}");
        storeUser({ ...stored, incomeType: type });
      } catch { /* non-critical */ }
      setStep(3);
    };

    return (
      <div className="onboarding-page">
        <ProgressBar step={step} />
        <div className="ob-step">
          <h2>How do you get paid?</h2>
          <div className="ob-income-type-grid">
            <button type="button" className="ob-income-type-card" onClick={() => handleSelect("fixed")}>
              <span className="ob-income-type-icon">💼</span>
              <span className="ob-income-type-title">Fixed Salary / Regular Job</span>
              <span className="ob-income-type-desc">I get the same amount every paycheck. My employer deposits it automatically.</span>
            </button>
            <button type="button" className="ob-income-type-card" onClick={() => handleSelect("variable")}>
              <span className="ob-income-type-icon">📊</span>
              <span className="ob-income-type-title">Variable / Part-Time</span>
              <span className="ob-income-type-desc">My pay changes week to week based on hours or tips. I'll enter what I made each period.</span>
            </button>
          </div>
          <p className="ob-tip">
            Not sure which to pick? Choose <strong>Fixed</strong> if you always get roughly the same paycheck. Choose <strong>Variable</strong> if your income changes.
          </p>
          <button type="button" className="link-button ob-skip" onClick={() => setStep(3)}>
            Skip for now →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3 — Pay Frequency ───────────────────────────────────────────────────
  if (step === 3) {
    return (
      <div className="onboarding-page">
        <ProgressBar step={step} />
        <div className="ob-step">
          <h2>How often do you get paid?</h2>
          <div className="ob-freq-grid">
            {FREQ_OPTIONS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`ob-freq-card${frequency === f.value ? " selected" : ""}`}
                onClick={() => { setFrequency(f.value); setStep(4); }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button type="button" className="link-button ob-skip" onClick={() => setStep(4)}>
            Skip for now →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 4 — Income Amount ───────────────────────────────────────────────────
  if (step === 4) {
    const canContinue = incomeAmount && nextPayDate;

    const handleContinue = async () => {
      setIncomeError("");
      setSaving(true);

      // Determine if selected payday is TODAY — drives which Step 5 screen appears
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      setPaydayIsToday(nextPayDate === todayStr);

      try {
        await authFetch("/api/income-sources", {
          method: "POST",
          body: JSON.stringify({
            name: "Primary Job",
            amount: Number(incomeAmount),
            frequency: frequency || "biweekly",
            nextPayDate,
            isPrimary: true,
          }),
        });
        setIncomeSaved(true);
      } catch (err) {
        if (!err.message?.includes("already have")) {
          setIncomeError("Couldn't save income. You can add it from your dashboard.");
        } else {
          setIncomeSaved(true);
        }
      } finally {
        setSaving(false);
        setStep(5);
      }
    };

    return (
      <div className="onboarding-page">
        <ProgressBar step={step} />
        <div className="ob-step">
          <h2>What is your take-home pay per paycheck?</h2>
          {frequency && (
            <p className="ob-freq-label">
              Frequency: <strong>{FREQ_OPTIONS.find((f) => f.value === frequency)?.label}</strong>
            </p>
          )}
          <div className="ob-form">
            <label>
              Take-home amount
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={incomeAmount}
                onChange={(e) => setIncomeAmount(e.target.value)}
                style={{ fontSize: "1.4rem", textAlign: "center", fontWeight: 700 }}
              />
            </label>
            <label>
              When is your next payday?
              <input
                type="date"
                value={nextPayDate}
                onChange={(e) => setNextPayDate(e.target.value)}
              />
            </label>
          </div>
          {incomeError && <p className="ob-error">{incomeError}</p>}
          <div className="ob-actions-col">
            <button
              type="button"
              className="primary-button"
              style={{ width: "100%" }}
              onClick={handleContinue}
              disabled={!canContinue || saving}
            >
              {saving ? "Saving..." : "Continue →"}
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              <button type="button" className="link-button ob-skip" onClick={() => setStep(3)}>← Back</button>
              <button type="button" className="link-button ob-skip" onClick={() => setStep(5)}>Skip for now →</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 5 — Bank Balance OR Payday-Today Smart Screen ───────────────────────
  if (step === 5) {

    // ── 5A: Payday is TODAY — show smart screen ───────────────────────────────
    if (paydayIsToday) {
      const needsAmount = paydayTodayChoice === "extra" || paydayTodayChoice === "overdrawn";
      const canContinue = paydayTodayChoice === "fresh" || (needsAmount && paydayTodayAmount !== "");

      const previewSpendable = () => {
        const paycheck = Number(incomeAmount) || 0;
        if (paydayTodayChoice === "extra") return paycheck + (Number(paydayTodayAmount) || 0);
        if (paydayTodayChoice === "overdrawn") return paycheck - (Number(paydayTodayAmount) || 0);
        return paycheck;
      };

      const handlePaydayTodayContinue = async () => {
        setPaydayTodayError("");
        setSaving(true);
        try {
          if (paydayTodayChoice === "extra") {
            // Create a one-time income entry for money already in the account
            await authFetch("/api/one-time-income", {
              method: "POST",
              body: JSON.stringify({
                name: "Starting Balance",
                amount: Number(paydayTodayAmount),
                date: new Date().toISOString().slice(0, 10),
                note: "Money in account before first paycheck",
              }),
            });
          } else if (paydayTodayChoice === "overdrawn") {
            // Create an expense entry for the overdraft amount
            await authFetch("/api/expenses", {
              method: "POST",
              body: JSON.stringify({
                description: "Overdrawn Balance",
                amount: Number(paydayTodayAmount),
                category: "Other",
                date: new Date().toISOString().slice(0, 10),
                note: "Account was overdrawn before first paycheck",
              }),
            });
          }
          // "fresh" — income source alone handles the spendable calculation
          setBalanceSaved(true);
        } catch (err) {
          setPaydayTodayError("Couldn't save. You can update this from your dashboard.");
        } finally {
          setSaving(false);
          setStep(6);
        }
      };

      return (
        <div className="onboarding-page">
          <ProgressBar step={step} />
          <div className="ob-step">
            <h2>🎉 You're getting paid today!</h2>
            <p className="ob-subtitle">Did you have any money in your account before this paycheck?</p>

            <div className="ob-payday-choices">
              <button
                type="button"
                className={`ob-payday-choice${paydayTodayChoice === "extra" ? " selected" : ""}`}
                onClick={() => { setPaydayTodayChoice("extra"); setPaydayTodayAmount(""); }}
              >
                <span className="ob-choice-icon">💰</span>
                <span className="ob-choice-label">Yes, I had extra money</span>
              </button>
              <button
                type="button"
                className={`ob-payday-choice${paydayTodayChoice === "fresh" ? " selected" : ""}`}
                onClick={() => { setPaydayTodayChoice("fresh"); setPaydayTodayAmount(""); }}
              >
                <span className="ob-choice-icon">✨</span>
                <span className="ob-choice-label">Nope, fresh start</span>
              </button>
              <button
                type="button"
                className={`ob-payday-choice${paydayTodayChoice === "overdrawn" ? " selected" : ""}`}
                onClick={() => { setPaydayTodayChoice("overdrawn"); setPaydayTodayAmount(""); }}
              >
                <span className="ob-choice-icon">📉</span>
                <span className="ob-choice-label">I was overdrawn</span>
              </button>
            </div>

            {needsAmount && (
              <div className="ob-form" style={{ marginTop: "1.25rem" }}>
                <label>
                  {paydayTodayChoice === "extra"
                    ? "How much extra did you have?"
                    : "How much were you overdrawn?"}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={paydayTodayAmount}
                    onChange={(e) => setPaydayTodayAmount(e.target.value)}
                    style={{ fontSize: "1.4rem", textAlign: "center", fontWeight: 700 }}
                  />
                </label>
              </div>
            )}

            {paydayTodayChoice === "fresh" && (
              <p className="ob-tip" style={{ textAlign: "center" }}>
                Your spendable ≈ <strong>${(Number(incomeAmount) || 0).toFixed(2)}</strong> (before bills)
              </p>
            )}

            {needsAmount && paydayTodayAmount !== "" && (
              <p className="ob-tip" style={{ textAlign: "center" }}>
                {paydayTodayChoice === "overdrawn"
                  ? <>Your spendable ≈ <strong>${Math.max(0, previewSpendable()).toFixed(2)}</strong> (before bills)</>
                  : <>Your spendable ≈ <strong>${previewSpendable().toFixed(2)}</strong> (before bills)</>}
              </p>
            )}

            {paydayTodayError && <p className="ob-error">{paydayTodayError}</p>}

            <div className="ob-actions-col">
              <button
                type="button"
                className="primary-button"
                style={{ width: "100%" }}
                onClick={handlePaydayTodayContinue}
                disabled={!canContinue || saving}
              >
                {saving ? "Saving..." : "Continue →"}
              </button>
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                <button type="button" className="link-button ob-skip" onClick={() => setStep(4)}>← Back</button>
                <button type="button" className="link-button ob-skip" onClick={() => setStep(6)}>Skip for now →</button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── 5B: Standard bank balance screen (payday is in the future) ───────────
    const handleContinue = async () => {
      setSaving(true);
      try {
        const balance = bankBalance !== "" ? Number(bankBalance) : 0;
        await authFetch("/api/user/me", {
          method: "PUT",
          body: JSON.stringify({ currentBalance: balance }),
        });
        setBalanceSaved(true);
      } catch { /* non-critical */ }
      finally {
        setSaving(false);
        setStep(6);
      }
    };

    return (
      <div className="onboarding-page">
        <ProgressBar step={step} />
        <div className="ob-step">
          <h2>What is your current bank balance?</h2>
          <p className="ob-subtitle">Enter exactly what you see in your checking account right now. This is your starting point.</p>
          <div className="ob-form">
            <label>
              Current balance
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={bankBalance}
                onChange={(e) => setBankBalance(e.target.value)}
                style={{ fontSize: "1.5rem", textAlign: "center", fontWeight: 700 }}
              />
            </label>
          </div>
          <p className="ob-tip">Overdrafted? No problem. Just enter a negative number like -50.00 and we'll calculate from there.</p>
          <div className="ob-actions-col">
            <button
              type="button"
              className="primary-button"
              style={{ width: "100%" }}
              onClick={handleContinue}
              disabled={saving}
            >
              {saving ? "Saving..." : "Continue →"}
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              <button type="button" className="link-button ob-skip" onClick={() => setStep(4)}>← Back</button>
              <button type="button" className="link-button ob-skip" onClick={() => setStep(6)}>Skip for now →</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 6 — Savings ─────────────────────────────────────────────────────────
  if (step === 6) {
    const handleContinue = async () => {
      if (saving) return; // guard against double-click racing past disabled
      setSaving(true);
      try {
        const amt = savings !== "" ? Math.max(0, Number(savings)) : 0;
        // Create the SavingsGoal record — single source of truth for savings.
        // The dashboard and Savings page both read from SavingsGoal.savedAmount,
        // so we no longer need a separate user.totalSavings write.
        if (amt > 0) {
          try {
            await authFetch("/api/savings-goals", {
              method: "POST",
              body: JSON.stringify({
                name: "My Savings",
                targetAmount: 999999,
                savedAmount: amt,
                perPaycheckAmount: 0,
                category: "Savings",
              }),
            });
          } catch { /* non-critical */ }
        }
        setSavingsSaved(true);
      } catch { /* non-critical */ }
      finally {
        setSaving(false);
        setStep(7);
      }
    };

    return (
      <div className="onboarding-page">
        <ProgressBar step={step} />
        <div className="ob-step">
          <h2>Do you have any savings set aside?</h2>
          <p className="ob-subtitle">Savings are kept completely separate from your spendable balance.</p>
          <div className="ob-form">
            <label>
              Current savings
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={savings}
                onChange={(e) => setSavings(e.target.value)}
                style={{ fontSize: "1.5rem", textAlign: "center", fontWeight: 700 }}
              />
            </label>
          </div>
          <div className="ob-actions-col">
            <button
              type="button"
              className="primary-button"
              style={{ width: "100%" }}
              onClick={handleContinue}
              disabled={saving}
            >
              {saving ? "Saving..." : "Continue →"}
            </button>
            <button type="button" className="link-button ob-skip" onClick={() => setStep(7)}>
              Skip for now →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 7 — First Bill ──────────────────────────────────────────────────────
  if (step === 7) {
    const canAdd = bill1.name && bill1.amount && bill1.dueDay;

    const handleAddBill = async () => {
      setBill1Error("");
      const day = Number(bill1.dueDay);
      if (day < 1 || day > 31) { setBill1Error("Due day must be between 1 and 31."); return; }
      setSaving(true);
      try {
        await authFetch("/api/bills", {
          method: "POST",
          body: JSON.stringify({ name: bill1.name, amount: Number(bill1.amount), dueDayOfMonth: day }),
        });
        setBill1Saved(true);
      } catch (err) {
        setBill1Error(err.message || "Couldn't save bill. You can add it later.");
      } finally {
        setSaving(false);
        setStep(8);
      }
    };

    return (
      <div className="onboarding-page">
        <ProgressBar step={step} />
        <div className="ob-step">
          <h2>Add your first bill.</h2>
          <p className="ob-subtitle">What's something you pay every month?</p>
          <div className="ob-form">
            <label>Bill name<input type="text" placeholder="e.g. Rent, Phone, Netflix" value={bill1.name} onChange={(e) => setBill1((p) => ({ ...p, name: e.target.value }))} /></label>
            <label>Amount<input type="number" min="0" step="0.01" placeholder="0.00" value={bill1.amount} onChange={(e) => setBill1((p) => ({ ...p, amount: e.target.value }))} /></label>
            <label>Due date (day of month)<input type="number" min="1" max="31" placeholder="1 – 31" value={bill1.dueDay} onChange={(e) => setBill1((p) => ({ ...p, dueDay: e.target.value }))} /></label>
          </div>
          {bill1Error && <p className="ob-error">{bill1Error}</p>}
          <div className="ob-actions-col">
            <button type="button" className="primary-button" style={{ width: "100%" }} onClick={handleAddBill} disabled={!canAdd || saving}>
              {saving ? "Saving..." : "Add Bill →"}
            </button>
            <button type="button" className="link-button ob-skip" onClick={() => setStep(8)}>Skip for now →</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 8 — Second Bill ─────────────────────────────────────────────────────
  if (step === 8) {
    const canAdd = bill2.name && bill2.amount && bill2.dueDay;

    const handleAddBill = async () => {
      setBill2Error("");
      const day = Number(bill2.dueDay);
      if (day < 1 || day > 31) { setBill2Error("Due day must be between 1 and 31."); return; }
      setSaving(true);
      try {
        await authFetch("/api/bills", {
          method: "POST",
          body: JSON.stringify({ name: bill2.name, amount: Number(bill2.amount), dueDayOfMonth: day }),
        });
        setBill2Saved(true);
      } catch (err) {
        setBill2Error(err.message || "Couldn't save bill. You can add it later.");
      } finally {
        setSaving(false);
        setStep(9);
      }
    };

    return (
      <div className="onboarding-page">
        <ProgressBar step={step} />
        <div className="ob-step">
          <h2>Great! Add one more bill.</h2>
          <div className="ob-form">
            <label>Bill name<input type="text" placeholder="e.g. Car payment, Internet" value={bill2.name} onChange={(e) => setBill2((p) => ({ ...p, name: e.target.value }))} /></label>
            <label>Amount<input type="number" min="0" step="0.01" placeholder="0.00" value={bill2.amount} onChange={(e) => setBill2((p) => ({ ...p, amount: e.target.value }))} /></label>
            <label>Due date (day of month)<input type="number" min="1" max="31" placeholder="1 – 31" value={bill2.dueDay} onChange={(e) => setBill2((p) => ({ ...p, dueDay: e.target.value }))} /></label>
          </div>
          {bill2Error && <p className="ob-error">{bill2Error}</p>}
          <div className="ob-actions-col">
            <button type="button" className="primary-button" style={{ width: "100%" }} onClick={handleAddBill} disabled={!canAdd || saving}>
              {saving ? "Saving..." : "Add Bill →"}
            </button>
            <button type="button" className="link-button ob-skip" onClick={() => setStep(9)}>Skip for now →</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 9 — All Set ─────────────────────────────────────────────────────────
  return (
    <div className="onboarding-page">
      <ProgressBar step={step} />
      <div className="ob-step ob-done">
        <div className="ob-checkmark" aria-hidden="true">✓</div>
        <h2>You're all set{user.firstName ? `, ${user.firstName}` : ""}!</h2>
        <p className="ob-subtitle">Your dashboard is ready.</p>
        {anythingSkipped && (
          <p className="ob-skip-note">
            You can add your income and bills anytime from your dashboard.
          </p>
        )}
        <button type="button" className="primary-button ob-cta" onClick={finishOnboarding} disabled={saving}>
          {saving ? "Setting up..." : "Go to my dashboard →"}
        </button>
      </div>
    </div>
  );
};

const ProgressBar = ({ step }) => (
  <div className="ob-progress">
    <div className="ob-progress-bar">
      <div className="ob-progress-fill" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
    </div>
    <span className="ob-step-label">Step {step} of {TOTAL_STEPS}</span>
  </div>
);

export default Onboarding;
