import { useCallback, useEffect, useState } from "react";
import { authFetch } from "../apiClient";
import { storeUser } from "../utils/safeStorage";

const getFirstName = () => {
  try { return JSON.parse(localStorage.getItem("user"))?.firstName || ""; } catch { return ""; }
};

const STEPS = [
  { selector: ".hero",              title: "Your Spendable Balance",    body: "This is your home base. The big number is what's actually yours to spend after every bill is covered. Check this before you spend anything.", pos: "below" },
  { selector: ".hero-balance",      title: "What This Number Means",    body: "This updates every time you log an expense, pay a bill, or add to savings. If it's negative, your bills cost more than what's left before your next paycheck.", pos: "below" },
  { selector: ".planner-section",   title: "Bills This Pay Period",     body: "These are the bills due before your next paycheck. PayPulse already subtracted them from your balance. Pay them on time and your balance stays accurate.", pos: "above" },
  { selector: ".dash-chart-col",    title: "Spending Breakdown",        body: "A quick look at where your money went this period. Switch between This Paycheck and Year to Date to see the full picture.", pos: "above" },
  { selector: '[href="/app/calendar"]', title: "Your Calendar",         body: "Every dollar laid out day by day. Green means money coming in. Red means money going out. Tap any day to see details or add something.", pos: "below" },
  { selector: '[href="/app/expenses"]', title: "Expenses",              body: "Log anything you spend outside your bills here \u2014 groceries, gas, a coffee, anything. The more you log, the more accurate your balance is.", pos: "below" },
  { selector: '[href="/app/bills"]',    title: "Bills",                 body: "Your recurring monthly bills live here. Add them once and PayPulse tracks them every month automatically.", pos: "below" },
  { selector: '[href="/app/payment-plans"]', title: "Payment Plans",    body: "Have a Klarna installment or payments you owe on specific dates? Add them here. PayPulse puts each one on your calendar and subtracts it from the right paycheck.", pos: "below" },
  { selector: '[href="/app/income"]',   title: "Income",                body: "Your paychecks and any extra money go here. PayPulse uses this to calculate everything \u2014 keep it accurate.", pos: "below" },
  { selector: '[href="/app/savings"]',  title: "Savings",               body: "Money you set aside for yourself. It leaves your spendable balance but stays yours. Withdraw anytime and it comes back as income.", pos: "below" },
  { selector: '[href="/app/settings"]', title: "Settings",              body: "Update your info, change your theme, set up bill reminders, and manage your subscription here.", pos: "below" },
  { selector: null, title: null, body: null, final: true },
];

const TourOverlay = ({ onFinish }) => {
  const [step, setStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState(null);
  const firstName = getFirstName();

  const measureTarget = useCallback(() => {
    const s = STEPS[step];
    if (!s?.selector) { setSpotlightRect(null); return; }
    const el = document.querySelector(s.selector);
    if (el) {
      const r = el.getBoundingClientRect();
      setSpotlightRect({ top: r.top - 8, left: r.left - 8, width: r.width + 16, height: r.height + 16 });
    } else {
      setSpotlightRect(null);
    }
  }, [step]);

  useEffect(() => {
    measureTarget();
    window.addEventListener("resize", measureTarget);
    window.addEventListener("scroll", measureTarget);
    return () => {
      window.removeEventListener("resize", measureTarget);
      window.removeEventListener("scroll", measureTarget);
    };
  }, [measureTarget]);

  const finish = async () => {
    try { await authFetch("/api/user/me", { method: "PUT", body: JSON.stringify({ tourCompleted: true }) }); } catch { /* ok */ }
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      u.tourCompleted = true;
      storeUser(u);
    } catch { /* ok */ }
    onFinish?.();
  };

  const current = STEPS[step];
  if (!current) return null;

  // Final full-screen card
  if (current.final) {
    return (
      <div className="pp-tour-overlay">
        <div className="pp-tour-final">
          <h2 className="pp-tour-final-title">You're all set{firstName ? `, ${firstName}` : ""}.</h2>
          <p className="pp-tour-final-body">PayPulse is ready. The more you use it, the more accurate your balance gets. Start by checking your bills and logging your first expense.</p>
          <button type="button" className="primary-button pp-tour-final-btn" onClick={finish}>Let's go</button>
        </div>
      </div>
    );
  }

  // Tooltip positioning
  const tt = {};
  if (spotlightRect) {
    if (current.pos === "above") {
      tt.bottom = window.innerHeight - spotlightRect.top + 12;
      tt.left = Math.max(16, Math.min(spotlightRect.left, window.innerWidth - 340));
    } else {
      tt.top = spotlightRect.top + spotlightRect.height + 12;
      tt.left = Math.max(16, Math.min(spotlightRect.left, window.innerWidth - 340));
    }
  } else {
    tt.top = "50%";
    tt.left = "50%";
    tt.transform = "translate(-50%, -50%)";
  }

  return (
    <div className="pp-tour-overlay">
      {/* Spotlight cutout */}
      {spotlightRect && (
        <div
          className="pp-tour-spotlight"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
          }}
        />
      )}
      {/* Tooltip */}
      <div className="pp-tour-tooltip" style={tt}>
        <div className="pp-tour-tt-title">{current.title}</div>
        <div className="pp-tour-tt-body">{current.body}</div>
        <div className="pp-tour-tt-footer">
          <span className="pp-tour-tt-count">{step + 1} of {STEPS.length - 1}</span>
          <div className="pp-tour-tt-actions">
            <button type="button" className="pp-tour-skip" onClick={finish}>Skip tour</button>
            <button
              type="button"
              className="primary-button pp-tour-next"
              onClick={() => setStep((s) => s + 1)}
            >
              {step === STEPS.length - 2 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TourOverlay;
