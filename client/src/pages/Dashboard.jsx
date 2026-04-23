import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { authFetch } from "../apiClient";
import { useDataCache } from "../context/DataCache";
import { useSubscription } from "../hooks/useSubscription";
import { useToast } from "../context/ToastContext";
import { useCelebration } from "../context/CelebrationContext";
import { getFirstName } from "../utils/userHelpers";
import DayExpensesModal from "../components/DayExpensesModal";
import AdSlot from "../components/AdSlot";
import SpendingBreakdown from "../components/SpendingBreakdown";
import PageContainer from "../components/PageContainer";
import { useCurrentPayPeriodDays } from "../hooks/useCurrentPayPeriodDays";

import { IconPlus, IconClose } from "../components/AppIcons";
import { currency } from "../utils/currency";

// Primary chip categories for the quick-add sheet — the ones 95% of
// expenses fall into. "Other" is always present as a fallback and forces
// the user to type a description so the entry is still meaningful.
const QUICK_CHIPS = ["Food", "Bills", "Savings", "Shopping", "Other"];

// Full category list shown in the legacy dropdown (for users who want
// more granular options). Kept for backwards compatibility with the
// ExpenseHistory filters.
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
  const { isFree, isTrialing, isPremium, trialDaysLeft } = useSubscription();
  const toast = useToast();
  const celebration = useCelebration();
  const storedUser = getStoredUser();
  const prevBalance = useRef(null);
  const navigate = useNavigate();

  const [selectedDay, setSelectedDay] = useState(null);
  const [showAllDays, setShowAllDays] = useState(false);
  const [billIdx, setBillIdx] = useState(0);
  const [spendingCats, setSpendingCats] = useState([]);
  const [quickForm, setQuickForm] = useState({ description: "", amount: "", category: "Food", date: todayISO() });
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  // Use the cache-provided summary; also keep the hook for day-level data
  const { days: payPeriodDays, loading: payPeriodLoading, refresh: refreshPayPeriod } = useCurrentPayPeriodDays();

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

  // ── Toast 4: balance negative → positive ──
  useEffect(() => {
    if (summary?.balance == null) return;
    const bal = summary.balance;
    if (prevBalance.current !== null && prevBalance.current < 0 && bal >= 0) {
      const fn = getFirstName();
      toast?.showToast?.(`Back in the green${fn ? `, ${fn}` : ""}.`);
    }
    prevBalance.current = bal;
  }, [summary?.balance]);

  // ── Celebration 2: spent less than last period ──
  // ── Celebration 3: 3 consecutive periods tracked ──
  useEffect(() => {
    if (!summary?.period?.start) return;
    const periodKey = (() => {
      const s = new Date(summary.period.start);
      return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
    })();
    const lastSeen = localStorage.getItem("pp_lastSeenPeriodStart");

    // Celebration 2 — on period transition, compare spending
    if (lastSeen && lastSeen !== periodKey) {
      const prevSpent = Number(localStorage.getItem("pp_prevPeriodSpent")) || 0;
      const justCompleted = summary.spentPreviousPeriod;
      if (justCompleted != null && prevSpent > 0 && justCompleted < prevSpent) {
        const diff = Math.round(prevSpent - justCompleted);
        const prevPeriodStart = summary.previousPeriod?.start || lastSeen;
        const fn = getFirstName();
        celebration?.showCelebration?.({
          title: "You spent less this period.",
          subtext: `$${diff} less than last period. Progress.`,
          buttonText: "Got it",
          storageKey: `celebration_spentLess_${prevPeriodStart}`,
        });
      }
      if (justCompleted != null) localStorage.setItem("pp_prevPeriodSpent", String(justCompleted));
    }
    localStorage.setItem("pp_lastSeenPeriodStart", periodKey);

    // Celebration 3 — 3 consecutive periods with expenses
    (async () => {
      try {
        const key = `celebration_3periods_${periodKey}`;
        if (localStorage.getItem(key)) return;
        const counts = await authFetch("/api/expenses/period-counts?periods=3");
        if (Array.isArray(counts) && counts.length >= 3 && counts.every((c) => c.count > 0)) {
          const fn = getFirstName();
          celebration?.showCelebration?.({
            title: "3 periods tracked.",
            subtext: `You're building the habit${fn ? `, ${fn}` : ""}. Keep going.`,
            buttonText: "Got it",
            storageKey: key,
          });
        }
      } catch { /* non-critical */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary?.period?.start]);

  const refreshAll = () => {
    cache?.fetchSummary();
    refreshPayPeriod();
    loadSpendingCategories();
  };

  const summaryLoading = !summary && !cache;

  const handleQuickExpense = async (e) => {
    e.preventDefault();
    if (!quickForm.amount || Number(quickForm.amount) <= 0) {
      setQuickError("Enter a valid amount.");
      return;
    }
    if (quickForm.category === "Other" && !quickForm.description.trim()) {
      setQuickError("Add a short description for this expense.");
      return;
    }
    setQuickSaving(true);
    setQuickError("");
    try {
      // expense.date drives which pay period this expense belongs to. A
      // future date won't affect the current "You Can Spend" — it'll roll
      // into the period that contains that date instead.
      const expenseDate = quickForm.date || todayISO();
      await authFetch("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          date: expenseDate,
          amount: Number(quickForm.amount),
          category: quickForm.category,
          description: quickForm.description,
        }),
      });
      setQuickForm({ description: "", amount: "", category: "Food", date: todayISO() });
      setSheetOpen(false);
      refreshAll();
    } catch { setQuickError("That didn't save. Try again."); }
    finally { setQuickSaving(false); }
  };

  return (
    <PageContainer>
      <div className="dashboard-page">
      {/* Hero */}
      <section className="hero">
        {summaryLoading && <p className="hero-loading">Loading...</p>}
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
          <button type="button" className="stat-card stat-card-clickable" onClick={() => navigate("/app/bills")}><span className="stat-label">Bills to pay</span><span className="stat-value bills">{currency.format(summary.totalBills || 0)}</span></button>
          <button type="button" className="stat-card stat-card-clickable" onClick={() => navigate("/app/payment-plans")}><span className="stat-label">Plans due</span><span className={`stat-value${(summary.totalPaymentPlansDue || 0) > 0 ? " bills" : ""}`}>{currency.format(summary.totalPaymentPlansDue || 0)}</span></button>
          <button type="button" className="stat-card stat-card-clickable" onClick={() => navigate("/app/expenses")}><span className="stat-label">Spent this period</span><span className="stat-value">{currency.format(summary.totalExpenses || 0)}</span></button>
          <button type="button" className="stat-card stat-card-clickable" onClick={() => navigate("/app/calendar")}><span className="stat-label">Days left</span><span className="stat-value">{summary.daysUntilNextPaycheck ?? "\u2014"}</span></button>
          <button type="button" className="stat-card stat-card-clickable" onClick={() => navigate("/app/savings")}><span className="stat-label">Savings</span><span className="stat-value teal">{currency.format(summary.totalSaved || 0)}</span></button>
        </div>
      )}

      {/* Incomplete setup warning */}
      {summary && summary.empty && (!summary.currentBalance || summary.currentBalance === 0) && (
        <Link to="/onboarding" className="dash-setup-banner">
          <span>Add your bank balance and income to see your real spendable balance.</span>
          <span className="dash-setup-banner-cta">Set up →</span>
        </Link>
      )}

      {/* Variable income prompt */}
      {storedUser.incomeType === "variable" && summary && summary.totalIncome === 0 && !summary.empty && (
        <Link to="/app/income" className="dash-variable-banner">
          <span>Log your income for this pay period.</span>
          <span className="dash-setup-banner-cta">Add income →</span>
        </Link>
      )}

      {/* Upgrade banner — only for genuinely free users. Trialing users
          have full premium access, so they don't see an upsell. */}
      {isFree && !isTrialing && (
        <div className="upgrade-banner">
          <span className="upgrade-banner-text">
            <strong>Free plan.</strong> Unlock unlimited bills and projections
          </span>
          <Link to="/subscription" className="primary-button">Upgrade</Link>
        </div>
      )}

      <AdSlot placement="banner" isPremium={isPremium} />

      {/* Free-tier quick add is locked to a banner; premium users get the
          FAB + bottom sheet below. */}
      {isFree && (
        <section className="quick-add premium-locked-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p className="quick-add-label" style={{ opacity: 0.5 }}>Quick add expense</p>
              <p style={{ fontSize: "0.78rem", color: "var(--accent)", margin: "0.25rem 0 0" }}>Quick expense tracking is a Premium feature.</p>
            </div>
            <Link to="/subscription" className="premium-lock-badge">Premium <span style={{ fontSize: "0.65rem" }}>Upgrade</span></Link>
          </div>
        </section>
      )}

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
                  <h2 className="section-title">Bills this pay period</h2>
                  <button type="button" className="pp5-btn pp5-btn-teal" onClick={() => setShowAllDays((p) => !p)}>
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

          {/* Compact "This Paycheck" mini card — stays after the main
              breakdown so the user always has a quick look at the current
              pay period without having to toggle. */}
          {summary && !summary.empty && (
            <section className="sb-mini-card">
              <h3 className="sb-mini-title">This paycheck</h3>
              <ul className="sb-mini-list">
                <li className="sb-mini-row">
                  <span className="sb-mini-name"><span className="sb-mini-dot" style={{ background: "#EF4444" }} />Bills</span>
                  <span className="sb-mini-amount">{currency.format(summary.totalBills || 0)}</span>
                </li>
                {(spendingCats || []).slice(0, 2).map((c) => (
                  <li key={c.category} className="sb-mini-row">
                    <span className="sb-mini-name">
                      <span className="sb-mini-dot" style={{ background: c.category === "Food" ? "#F59E0B" : "#14B8A6" }} />
                      {c.category}
                    </span>
                    <span className="sb-mini-amount">{currency.format(c.total || 0)}</span>
                  </li>
                ))}
                <li className="sb-mini-row sb-mini-row-total">
                  <span className="sb-mini-name"><span className="sb-mini-dot" style={{ background: "#14B8A6" }} />Available</span>
                  <span className="sb-mini-amount sb-mini-available">{currency.format(summary.balance || 0)}</span>
                </li>
              </ul>
            </section>
          )}
        </section>
      </div>

      {selectedDay && (
        <DayExpensesModal isOpen date={selectedDay.date} items={selectedDay.expenses} total={selectedDay.expensesTotal}
          onClose={() => setSelectedDay(null)} onExpenseSaved={() => { setSelectedDay(null); refreshAll(); }} />
      )}

      {/* Quick-add floating action button — premium only */}
      {!isFree && (
        <button
          type="button"
          className="pp-fab"
          aria-label="Add expense"
          onClick={() => setSheetOpen(true)}
        >
          <IconPlus width="26" height="26" strokeWidth="2.5" />
        </button>
      )}

      {/* Quick-add bottom sheet */}
      {!isFree && sheetOpen && (
        <div
          className="pp-sheet-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setSheetOpen(false); }}
        >
          <div className="pp-sheet" role="dialog" aria-label="Add expense">
            <div className="pp-sheet-handle" />
            <div className="pp-sheet-header">
              <h3 className="pp-sheet-title">Add expense</h3>
              <button
                type="button"
                className="pp-sheet-close"
                aria-label="Close"
                onClick={() => setSheetOpen(false)}
              >
                <IconClose width="18" height="18" />
              </button>
            </div>
            <form className="quick-add-form" onSubmit={handleQuickExpense}>
              <div className="qa-field">
                <label className="qa-label" htmlFor="qa-desc">Description</label>
                <input
                  id="qa-desc"
                  type="text"
                  className={`qa-input${quickError && quickForm.category === "Other" && !quickForm.description.trim() ? " error" : ""}`}
                  placeholder={quickForm.category === "Other" ? "What is this for?" : "Optional"}
                  value={quickForm.description}
                  onChange={(e) => setQuickForm((p) => ({ ...p, description: e.target.value }))}
                  required={quickForm.category === "Other"}
                />
              </div>

              <div className="qa-field">
                <label className="qa-label" htmlFor="qa-amount">Amount</label>
                <input
                  id="qa-amount"
                  type="number"
                  inputMode="decimal"
                  className={`qa-input${quickError && (!quickForm.amount || Number(quickForm.amount) <= 0) ? " error" : ""}`}
                  placeholder="$0.00"
                  step="0.01"
                  min="0.01"
                  value={quickForm.amount}
                  onChange={(e) => setQuickForm((p) => ({ ...p, amount: e.target.value }))}
                  required
                />
              </div>

              <div className="qa-field">
                <label className="qa-label">Category</label>
                <div className="qa-chips" role="group" aria-label="Category">
                  {QUICK_CHIPS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`qa-chip${quickForm.category === c ? " active" : ""}`}
                      onClick={() => setQuickForm((p) => ({ ...p, category: c }))}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="qa-field">
                <label className="qa-label" htmlFor="qa-date">Date</label>
                <input
                  id="qa-date"
                  type="date"
                  className="qa-input"
                  value={quickForm.date}
                  onChange={(e) => setQuickForm((p) => ({ ...p, date: e.target.value }))}
                />
                {quickForm.date !== todayISO() && (
                  <p className="qa-future-note">Applies to the pay period containing <strong>{formatReadableDate(quickForm.date)}</strong>.</p>
                )}
              </div>

              {quickError && <p className="qa-error">{quickError}</p>}

              <button type="submit" className="qa-submit" disabled={quickSaving}>
                {quickSaving ? "Saving…" : "Add expense"}
              </button>
            </form>
          </div>
        </div>
      )}
      </div>
    </PageContainer>
  );
};

export default Dashboard;
