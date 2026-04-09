import { useState } from "react";
import { authFetch } from "../apiClient";

const FREQ_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "twicemonthly", label: "Semi-Monthly" },
  { value: "monthly", label: "Monthly" },
];

const TOTAL_STEPS = 6;

const Onboarding = () => {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const user = (() => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } })();

  // Step 2 state
  const [frequency, setFrequency] = useState("");

  // Step 3 state
  const [incomeAmount, setIncomeAmount] = useState("");
  const [nextPayDate, setNextPayDate] = useState("");
  const [incomeError, setIncomeError] = useState("");
  const [incomeSaved, setIncomeSaved] = useState(false);

  // Step 4 & 5 state
  const [bill1, setBill1] = useState({ name: "", amount: "", dueDay: "" });
  const [bill1Error, setBill1Error] = useState("");
  const [bill1Saved, setBill1Saved] = useState(false);
  const [bill2, setBill2] = useState({ name: "", amount: "", dueDay: "" });
  const [bill2Error, setBill2Error] = useState("");
  const [bill2Saved, setBill2Saved] = useState(false);

  const anythingSkipped = !incomeSaved || (!bill1Saved && !bill2Saved);

  const finishOnboarding = async () => {
    try {
      const updated = await authFetch("/api/user/complete-onboarding", { method: "POST" });
      localStorage.setItem("user", JSON.stringify(updated));
    } catch { /* non-critical */ }
    window.location.href = "/app";
  };

  // ── Step 1 ──────────────────────────────────────────────────────────────────
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

  // ── Step 2 — Pay Frequency ───────────────────────────────────────────────────
  if (step === 2) {
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
                onClick={() => { setFrequency(f.value); setStep(3); }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button type="button" className="link-button ob-skip" onClick={() => setStep(3)}>
            Skip for now →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3 — Income ──────────────────────────────────────────────────────────
  if (step === 3) {
    const canContinue = incomeAmount && nextPayDate;

    const handleContinue = async () => {
      setIncomeError("");
      setSaving(true);
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
        if (!err.message?.includes("duplicate")) {
          setIncomeError("Failed to save income. You can add it later from your dashboard.");
        }
      } finally {
        setSaving(false);
        setStep(4);
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
            <button type="button" className="link-button ob-skip" onClick={() => setStep(4)}>
              Skip for now →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 4 — First Bill ──────────────────────────────────────────────────────
  if (step === 4) {
    const canAdd = bill1.name && bill1.amount && bill1.dueDay;

    const handleAddBill = async () => {
      setBill1Error("");
      const day = Number(bill1.dueDay);
      if (day < 1 || day > 31) { setBill1Error("Due day must be between 1 and 31."); return; }
      setSaving(true);
      try {
        await authFetch("/api/bills", {
          method: "POST",
          body: JSON.stringify({
            name: bill1.name,
            amount: Number(bill1.amount),
            dueDayOfMonth: day,
          }),
        });
        setBill1Saved(true);
      } catch (err) {
        setBill1Error(err.message || "Failed to save bill. You can add it later.");
      } finally {
        setSaving(false);
        setStep(5);
      }
    };

    return (
      <div className="onboarding-page">
        <ProgressBar step={step} />
        <div className="ob-step">
          <h2>Add your first bill.</h2>
          <p className="ob-subtitle">What's something you pay every month?</p>
          <div className="ob-form">
            <label>
              Bill name
              <input
                type="text"
                placeholder="e.g. Rent, Phone, Netflix"
                value={bill1.name}
                onChange={(e) => setBill1((p) => ({ ...p, name: e.target.value }))}
              />
            </label>
            <label>
              Amount
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={bill1.amount}
                onChange={(e) => setBill1((p) => ({ ...p, amount: e.target.value }))}
              />
            </label>
            <label>
              Due date (day of month)
              <input
                type="number"
                min="1"
                max="31"
                placeholder="1 – 31"
                value={bill1.dueDay}
                onChange={(e) => setBill1((p) => ({ ...p, dueDay: e.target.value }))}
              />
            </label>
          </div>
          {bill1Error && <p className="ob-error">{bill1Error}</p>}
          <div className="ob-actions-col">
            <button
              type="button"
              className="primary-button"
              style={{ width: "100%" }}
              onClick={handleAddBill}
              disabled={!canAdd || saving}
            >
              {saving ? "Saving..." : "Add Bill →"}
            </button>
            <button type="button" className="link-button ob-skip" onClick={() => setStep(5)}>
              Skip for now →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 5 — Second Bill ─────────────────────────────────────────────────────
  if (step === 5) {
    const canAdd = bill2.name && bill2.amount && bill2.dueDay;

    const handleAddBill = async () => {
      setBill2Error("");
      const day = Number(bill2.dueDay);
      if (day < 1 || day > 31) { setBill2Error("Due day must be between 1 and 31."); return; }
      setSaving(true);
      try {
        await authFetch("/api/bills", {
          method: "POST",
          body: JSON.stringify({
            name: bill2.name,
            amount: Number(bill2.amount),
            dueDayOfMonth: day,
          }),
        });
        setBill2Saved(true);
      } catch (err) {
        setBill2Error(err.message || "Failed to save bill. You can add it later.");
      } finally {
        setSaving(false);
        setStep(6);
      }
    };

    return (
      <div className="onboarding-page">
        <ProgressBar step={step} />
        <div className="ob-step">
          <h2>Great! Add one more bill.</h2>
          <div className="ob-form">
            <label>
              Bill name
              <input
                type="text"
                placeholder="e.g. Car payment, Internet"
                value={bill2.name}
                onChange={(e) => setBill2((p) => ({ ...p, name: e.target.value }))}
              />
            </label>
            <label>
              Amount
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={bill2.amount}
                onChange={(e) => setBill2((p) => ({ ...p, amount: e.target.value }))}
              />
            </label>
            <label>
              Due date (day of month)
              <input
                type="number"
                min="1"
                max="31"
                placeholder="1 – 31"
                value={bill2.dueDay}
                onChange={(e) => setBill2((p) => ({ ...p, dueDay: e.target.value }))}
              />
            </label>
          </div>
          {bill2Error && <p className="ob-error">{bill2Error}</p>}
          <div className="ob-actions-col">
            <button
              type="button"
              className="primary-button"
              style={{ width: "100%" }}
              onClick={handleAddBill}
              disabled={!canAdd || saving}
            >
              {saving ? "Saving..." : "Add Bill →"}
            </button>
            <button type="button" className="link-button ob-skip" onClick={() => setStep(6)}>
              Skip for now →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 6 — All Set ─────────────────────────────────────────────────────────
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
        <button
          type="button"
          className="primary-button ob-cta"
          onClick={finishOnboarding}
          disabled={saving}
        >
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
