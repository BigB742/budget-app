import { useCallback, useEffect, useState } from "react";

import { authFetch } from "../apiClient";
import { useDataCache } from "../context/DataCache";
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

const Dashboard = () => {
  const cache = useDataCache();
  const summary = cache?.summary;

  const [selectedDay, setSelectedDay] = useState(null);
  const [showAllDays, setShowAllDays] = useState(false);
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
          <div className="stat-card"><span className="stat-label">Saved</span><span className="stat-value teal">{currency.format(summary.savingsThisPeriod || 0)}</span></div>
        </div>
      )}

      <AdSlot placement="banner" />

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
          <div className="planner-header-row">
            <h2 className="section-title">Upcoming</h2>
            <button type="button" className="link-button" onClick={() => setShowAllDays((p) => !p)}>
              {showAllDays ? "Active only" : "Show all days"}
            </button>
          </div>
          {payPeriodError && <p className="status status-error">{payPeriodError}</p>}
          {payPeriodLoading ? <p className="status">Loading...</p> : !payPeriodDays.length ? (
            <div className="empty-state"><p>Set up your income to see your daily plan.</p></div>
          ) : displayDays.length === 0 ? (
            <p className="empty-hint">No upcoming bills or expenses this period.</p>
          ) : (
            <ul className="activity-list">
              {displayDays.flatMap((day) => {
                const rows = [];
                const dateLabel = `${day.weekdayLabel} ${day.dayOfMonth}`;
                if (day.isPayday) rows.push(
                  <li key={`${day.dateKey}-pay`} className="up-row up-payday" onClick={() => setSelectedDay(day)}>
                    <span className="up-accent up-accent-gold" />
                    <div className="up-body"><span className="up-name">Payday</span><span className="up-date">{dateLabel}</span></div>
                    <span className="up-amt up-amt-gold">+{currency.format(getPaydayAmount())}</span>
                  </li>
                );
                (day.incomes || []).forEach((inc) => rows.push(
                  <li key={inc._id} className="up-row up-income" onClick={() => setSelectedDay(day)}>
                    <span className="up-accent up-accent-purple" />
                    <div className="up-body"><span className="up-name">{inc.name}</span><span className="up-date">{dateLabel}</span></div>
                    <span className="up-amt up-amt-purple">+{currency.format(inc.amount)}</span>
                  </li>
                ));
                day.bills.forEach((b) => rows.push(
                  <li key={b._id + day.dateKey} className="up-row up-bill" onClick={() => setSelectedDay(day)}>
                    <span className="up-accent up-accent-red" />
                    <div className="up-body"><span className="up-name">{b.name}</span><span className="up-date">{dateLabel}</span></div>
                    <span className="up-amt up-amt-red">&minus;{currency.format(b.amount)}</span>
                  </li>
                ));
                day.expenses.forEach((exp, i) => rows.push(
                  <li key={(exp._id || i) + day.dateKey} className="up-row up-expense" onClick={() => setSelectedDay(day)}>
                    <span className="up-accent up-accent-gray" />
                    <div className="up-body"><span className="up-name">{exp.description || exp.category || "Expense"}</span><span className="up-date">{dateLabel}</span></div>
                    <span className="up-amt">{currency.format(exp.amount)}</span>
                  </li>
                ));
                return rows;
              })}
            </ul>
          )}
          <p className="planner-hint">Tap a day to add or review expenses.</p>
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
