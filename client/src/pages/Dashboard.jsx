import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { authFetch } from "../apiClient";
import { useDataCache } from "../context/DataCache";
import { useSubscription } from "../hooks/useSubscription";
import DayExpensesModal from "../components/DayExpensesModal";
import AdSlot from "../components/AdSlot";
import SpendingBreakdown from "../components/SpendingBreakdown";
import { useCurrentPayPeriodDays } from "../hooks/useCurrentPayPeriodDays";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const CATEGORY_OPTIONS = [
  "Dining Out", "Entertainment", "Food", "Gas", "Groceries",
  "Gym", "Health", "Home", "Shopping", "Subscriptions", "Travel", "Other",
];

const formatReadableDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const getStoredUser = () => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } };

const Dashboard = () => {
  const cache = useDataCache();
  const summary = cache?.summary;
  const { isFree, isTrialing, trialDaysLeft } = useSubscription();
  const storedUser = getStoredUser();

  const [selectedDay, setSelectedDay] = useState(null);
  const [showAllDays, setShowAllDays] = useState(false);
  const [billIdx, setBillIdx] = useState(0);
  const [spendingCats, setSpendingCats] = useState([]);
  const [quickForm, setQuickForm] = useState({ description: "", amount: "", category: "Food" });
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState("");

  // Use the cache-provided summary; also keep the hook for day-level data
  const { days: payPeriodDays, loading: payPeriodLoading, error: payPeriodError, refresh: refreshPayPeriod } = useCurrentPayPeriodDays();

  // Fetch summary + spending categories via cache on mount
  const loadSpendingCategories = useCallback(async () => {
    try {
      const data = await authFetch("/api/summary/expense-categories");
      setSpendingCats(data.categories || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    cache?.fetchSummary();
    loadSpendingCategories();
  }, []);

  const refreshAll = () => {
    cache?.fetchSummary();
    refreshPayPeriod();
    loadSpendingCategories();
  };

  const summaryLoading = !summary && !cache;
  const summaryError = null;

  const handleQuickExpense = async (e) => {
    e.preventDefault();
    if (!quickForm.amount || Number(quickForm.amount) <= 0) return;
    if (quickForm.category === "Other" && !quickForm.description.trim()) { setQuickError("Description required for Other category."); return; }
    setQuickSaving(true);
    setQuickError("");
    try {
      await authFetch("/api/expenses", { method: "POST", body: JSON.stringify({ date: todayISO(), amount: Number(quickForm.amount), category: quickForm.category, description: quickForm.description }) });
      setQuickForm({ description: "", amount: "", category: "Food" });
      refreshAll();
    } catch { setQuickError("Couldn't save. Try again."); }
    finally { setQuickSaving(false); }
  };

  const activeDays = payPeriodDays.filter((d) => d.billsTotal > 0 || d.expensesTotal > 0 || d.incomesTotal > 0 || d.isPayday);
  const displayDays = showAllDays ? payPeriodDays : activeDays;

  // Find per-source paycheck amount for payday rows
  const getPaydayAmount = () => {
    if (!summary?.sources?.length) return summary?.totalIncome || 0;
    // Show primary source amount, or first source
    const primary = summary.sources.find((s) => s.paydaysInPeriod > 0);
    return primary ? primary.amount : (summary.totalIncome || 0);
  };

  return (
    <div className="dashboard-page">
      {/* Hero */}
      <section className="hero">
        {summaryLoading && <p className="hero-loading">Loading...</p>}
        {summaryError && <p className="hero-error">{summaryError}</p>}
        {summary && (
          <>
            <p className="hero-label">You can spend</p>
            <p className={`hero-balance${(summary.balance || 0) >= 500 ? " healthy" : (summary.balance || 0) < 100 ? " warning" : ""}`}>
              {currency.format(summary.balance || 0)}
            </p>
            <p className="hero-sub">
              {summary.empty ? "Set up your income to see your real balance" : `After all bills through ${formatReadableDate(summary.periodLabel?.end)}`}
            </p>
            {summary.nextPaycheckBalance != null && summary.nextPayDateLabel && (
              <div className="hero-next-pill">
                Next paycheck ({formatReadableDate(summary.nextPayDateLabel)}): <strong>{currency.format(summary.nextPaycheckBalance)}</strong>
              </div>
            )}
          </>
        )}
      </section>

      {/* Stat cards */}
      {summary && (
        <div className="stat-grid">
          <div className="stat-card"><span className="stat-label">Bills to pay</span><span className="stat-value bills">{currency.format(summary.totalBills || 0)}</span></div>
          <div className="stat-card"><span className="stat-label">What I've spent</span><span className="stat-value">{currency.format(summary.totalExpenses || 0)}</span></div>
          <div className="stat-card"><span className="stat-label">Days left</span><span className="stat-value">{summary.daysUntilNextPaycheck ?? "\u2014"}</span></div>
          <div className="stat-card"><span className="stat-label">Saved</span><span className="stat-value teal">{currency.format(summary.totalSaved || 0)}</span></div>
        </div>
      )}

      {/* Incomplete setup warning */}
      {summary && summary.empty && (!storedUser.currentBalance || storedUser.currentBalance === 0) && (
        <Link to="/onboarding" className="dash-setup-banner">
          <span>⚠️ Your balance may not be accurate. Add your current bank balance and income to see your real spendable balance.</span>
          <span className="dash-setup-banner-cta">Set up →</span>
        </Link>
      )}

      {/* Variable income prompt */}
      {storedUser.incomeType === "variable" && summary && summary.totalIncome === 0 && !summary.empty && (
        <Link to="/app/income" className="dash-variable-banner">
          <span>💰 Don't forget to log your income for this pay period!</span>
          <span className="dash-setup-banner-cta">Add income →</span>
        </Link>
      )}

      {/* Upgrade banner for free/trialing users */}
      {(isFree || isTrialing) && (
        <div className="upgrade-banner">
          <span className="upgrade-banner-text">
            {isTrialing ? <><strong>Trial:</strong> {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left</> : <><strong>Free plan</strong> — unlock unlimited bills and projections</>}
          </span>
          <Link to="/subscription" className="primary-button">Upgrade</Link>
        </div>
      )}

      <AdSlot placement="banner" isPremium={!isFree && !isTrialing} />

      {/* Quick add */}
      <section className="quick-add">
        <p className="quick-add-label">Quick add</p>
        <form className="quick-add-form" onSubmit={handleQuickExpense}>
          <input type="text" name="description" placeholder={quickForm.category === "Other" ? "What is this for? (required)" : "Description"} value={quickForm.description} onChange={(e) => setQuickForm((p) => ({ ...p, description: e.target.value }))} required={quickForm.category === "Other"} className="quick-input quick-desc" />
          <input type="number" name="amount" placeholder="$0.00" step="0.01" min="0.01" value={quickForm.amount} onChange={(e) => setQuickForm((p) => ({ ...p, amount: e.target.value }))} required className="quick-input quick-amount" />
          <select name="category" value={quickForm.category} onChange={(e) => setQuickForm((p) => ({ ...p, category: e.target.value }))} className="quick-input quick-cat">
            {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="submit" className="quick-add-btn" disabled={quickSaving}>{quickSaving ? "..." : "+ Add"}</button>
        </form>
        {quickError && <p className="quick-error">{quickError}</p>}
      </section>

      {/* Two-column: planner + charts */}
      <div className="dash-columns">
        <section className="planner-section">
          {(() => {
            // Bills only, current month, sorted by due date
            const now = new Date();
            const thisMonth = now.getMonth();
            const thisYear = now.getFullYear();
            const todayDate = now.getDate();
            const monthName = now.toLocaleDateString("en-US", { month: "long" });
            const monthBills = [];
            payPeriodDays.forEach((day) => {
              if (day.date.getMonth() === thisMonth && day.date.getFullYear() === thisYear) {
                day.bills.forEach((b) => monthBills.push({ name: b.name, amount: b.amount, dayOfMonth: day.dayOfMonth, dateLabel: `${day.weekdayLabel} ${day.dayOfMonth}`, day }));
              }
            });
            monthBills.sort((a, b) => a.dayOfMonth - b.dayOfMonth);
            const allPassed = monthBills.length > 0 && monthBills.every((b) => b.dayOfMonth < todayDate);
            const idx = Math.max(0, Math.min(billIdx, monthBills.length - 1));

            return (
              <>
                <div className="planner-header-row">
                  <h2 className="section-title">Bills This Pay Period</h2>
                  <button type="button" className="link-button" onClick={() => setShowAllDays((p) => !p)}>
                    {showAllDays ? "Card view" : "Show all"}
                  </button>
                </div>
                {payPeriodLoading ? <p className="status">Loading...</p> : !monthBills.length ? (
                  <div className="empty-state"><p>No bills this month. Add some on the Bills page.</p></div>
                ) : allPassed ? (
                  <div className="empty-state"><p>You're all caught up for {monthName}!</p></div>
                ) : showAllDays ? (
                  <ul className="activity-list">
                    {monthBills.map((b, i) => (
                      <li key={i} className="up-row up-bill" onClick={() => setSelectedDay(b.day)}>
                        <span className="up-accent up-accent-red" />
                        <div className="up-body"><span className="up-name">{b.name}</span><span className="up-date">{b.dateLabel}</span></div>
                        <span className="up-amt up-amt-red">&minus;{currency.format(b.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="upcoming-card">
                    <button type="button" className="up-arrow" disabled={idx <= 0} onClick={() => setBillIdx(idx - 1)}>&larr;</button>
                    <div className="up-card-body" onClick={() => setSelectedDay(monthBills[idx]?.day)}>
                      <span className="up-accent up-accent-red" />
                      <div className="up-body"><span className="up-name">{monthBills[idx]?.name}</span><span className="up-date">{monthBills[idx]?.dateLabel}</span></div>
                      <span className="up-amt up-amt-red">&minus;{currency.format(monthBills[idx]?.amount || 0)}</span>
                    </div>
                    <button type="button" className="up-arrow" disabled={idx >= monthBills.length - 1} onClick={() => setBillIdx(idx + 1)}>&rarr;</button>
                  </div>
                )}
                {!showAllDays && monthBills.length > 0 && !allPassed && (
                  <p className="planner-hint">{idx + 1} of {monthBills.length} this month</p>
                )}
              </>
            );
          })()}
        </section>

        <section className="dash-chart-col">
          <SpendingBreakdown expensesByCategory={spendingCats} summary={summary} />
        </section>
      </div>

      {selectedDay && (
        <DayExpensesModal isOpen date={selectedDay.date} items={selectedDay.expenses} total={selectedDay.expensesTotal}
          onClose={() => setSelectedDay(null)} onExpenseSaved={() => { setSelectedDay(null); refreshAll(); }} />
      )}
    </div>
  );
};

export default Dashboard;
