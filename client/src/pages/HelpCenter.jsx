import { useState } from "react";
import { useNavigate } from "react-router-dom";

const Accordion = ({ items }) => {
  const [openIdx, setOpenIdx] = useState(null);
  return (
    <div className="hc-accordion">
      {items.map((item, i) => (
        <div key={i} className={`hc-acc-item${openIdx === i ? " open" : ""}`}>
          <button
            type="button"
            className="hc-acc-trigger"
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
            aria-expanded={openIdx === i}
          >
            <span>{item.q || item.term}</span>
            <span className="hc-acc-arrow">{openIdx === i ? "−" : "+"}</span>
          </button>
          {openIdx === i && <div className="hc-acc-body">{item.a || item.def}</div>}
        </div>
      ))}
    </div>
  );
};

const SECTIONS = [
  { name: "Dashboard",     summary: "Your real spendable balance and pay period overview.",      detail: "This is your home base. The big number is what's actually yours to spend after every bill is covered. Check this before you spend anything." },
  { name: "Calendar",      summary: "Every transaction laid out by date.",                        detail: "Every dollar laid out day by day. Green means money coming in. Red means money going out. Tap any day to see details or add something." },
  { name: "Expenses",      summary: "Log and review everything you spend.",                       detail: "Log anything you spend outside your bills here \u2014 groceries, gas, a coffee, anything. The more you log, the more accurate your balance is." },
  { name: "Bills",         summary: "Track your recurring monthly bills.",                        detail: "Your recurring monthly bills live here. Add them once and PayPulse tracks them every month automatically." },
  { name: "Payment Plans", summary: "Manage installments and scheduled payments.",                detail: "Have a Klarna installment or payments you owe on specific dates? Add them here. PayPulse puts each one on your calendar and subtracts it from the right paycheck." },
  { name: "Income",        summary: "Your paychecks and one-time income.",                        detail: "Your paychecks and any extra money go here. PayPulse uses this to calculate everything \u2014 keep it accurate." },
  { name: "Savings",       summary: "Set money aside and track your goals.",                      detail: "Money you set aside for yourself. It leaves your spendable balance but stays yours. Withdraw anytime and it comes back as income." },
  { name: "Settings",      summary: "Manage your account and preferences.",                       detail: "Update your info, change your theme, set up bill reminders, and manage your subscription here." },
];

const GLOSSARY = [
  { term: "Spendable Balance", def: "Your paycheck minus every bill and expense due before your next payday. This is what\u2019s actually safe to spend \u2014 not just your bank balance." },
  { term: "Pay Period", def: "The stretch of time between one paycheck and the next. PayPulse organizes everything around your pay periods so nothing gets missed." },
  { term: "Bill", def: "A recurring charge that hits every month on a set date \u2014 rent, phone, subscriptions. Add it once and PayPulse tracks it forever." },
  { term: "Expense", def: "Anything you spend outside your scheduled bills. Gas, food, a haircut. Log it so your balance stays accurate." },
  { term: "Payment Plan", def: "A purchase split into payments on specific dates \u2014 like Klarna or a personal agreement. Add the dates and amounts and PayPulse handles the rest." },
  { term: "Savings", def: "Money you move from your spendable balance into a savings goal. It\u2019s still yours \u2014 you can withdraw it anytime and it comes back as income." },
  { term: "Income", def: "Your paycheck plus any extra money that came in. All income feeds your spendable balance." },
  { term: "Negative Balance", def: "Your bills cost more than what\u2019s left in your current pay period. Your next paycheck will reset it \u2014 but it\u2019s a signal to watch your spending." },
];

const FAQ = [
  { q: "Why is my balance negative?", a: "Your bills and expenses due before your next paycheck add up to more than what you have left from your current paycheck. Your balance will reset when your next paycheck is added. Consider reviewing your bills and expenses to see if anything can wait until after payday." },
  { q: "What is the difference between a Bill and an Expense?", a: "A bill is something you pay every month on the same date \u2014 like rent or your phone plan. An expense is a one-time or irregular purchase \u2014 like gas or groceries. Bills are tracked automatically every month. Expenses you log as they happen." },
  { q: "What is the difference between a Bill and a Payment Plan?", a: "A bill repeats every month indefinitely. A Payment Plan has a fixed number of payments with specific dates and ends automatically when the last payment is made." },
  { q: "When does my pay period reset?", a: "Your pay period resets on each payday based on the pay schedule you set during onboarding. You can review your next payday on the Dashboard or Income page." },
  { q: "If I withdraw from savings, where does the money go?", a: "It comes back as one-time income and is added to your spendable balance. It will also appear on your calendar as an income entry on the withdrawal date." },
  { q: "Does PayPulse connect to my bank?", a: "Not yet \u2014 PayPulse currently uses manual entry so you stay in control of what\u2019s tracked. Bank sync may be added in a future update." },
];

const HelpCenter = () => {
  const navigate = useNavigate();
  const [expandedCard, setExpandedCard] = useState(null);

  const launchTour = () => {
    navigate("/app");
    setTimeout(() => { window.__ppLaunchTour?.(); }, 400);
  };

  return (
    <div className="history-page">
      <h1>Help Center</h1>

      {/* Section 1 — What does each section do? */}
      <h2 className="hc-section-title">What does each section do?</h2>
      <div className="hc-grid">
        {SECTIONS.map((s, i) => (
          <div key={s.name} className="hc-card" onClick={() => setExpandedCard(expandedCard === i ? null : i)}>
            <div className="hc-card-head">
              <strong>{s.name}</strong>
              <span className="hc-acc-arrow">{expandedCard === i ? "−" : "+"}</span>
            </div>
            <p className="hc-card-summary">{s.summary}</p>
            {expandedCard === i && <p className="hc-card-detail">{s.detail}</p>}
          </div>
        ))}
      </div>

      {/* Section 2 — Glossary */}
      <h2 className="hc-section-title">Glossary</h2>
      <Accordion items={GLOSSARY} />

      {/* Section 3 — FAQ */}
      <h2 className="hc-section-title">FAQ</h2>
      <Accordion items={FAQ} />

      {/* Section 4 — Take the Tour */}
      <div style={{ textAlign: "center", marginTop: 32 }}>
        <button type="button" className="primary-button" style={{ minWidth: 200 }} onClick={launchTour}>
          Take the Tour
        </button>
      </div>
    </div>
  );
};

export default HelpCenter;
