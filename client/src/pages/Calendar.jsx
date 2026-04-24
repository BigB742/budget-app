import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch } from "../apiClient";
import { useSubscription } from "../hooks/useSubscription";
import { useDataCache } from "../context/DataCache";
import { useToast } from "../context/ToastContext";
import { getFirstName } from "../utils/userHelpers";
import { currency } from "../utils/currency";
import PageContainer from "../components/PageContainer";
import SideSheet from "../components/SideSheet";
import PaidToggle from "../components/ui/PaidToggle";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CATEGORY_OPTIONS = [
  "Dining Out", "Entertainment", "Food", "Gas", "Groceries",
  "Gym", "Health", "Home", "Shopping", "Subscriptions", "Travel", "Other",
];

const QUICK_CHIPS = ["Food", "Bills", "Savings", "Shopping", "Other"];

const toKey = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const buildMonthGrid = (year, month) => {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = [];
  let week = new Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }
  return weeks;
};

const Calendar = () => {
  const { isPremium, isTrialing } = useSubscription();
  const cache = useDataCache();
  const toast = useToast();
  const hasPremiumAccess = isPremium || isTrialing;
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  // Week vs Month toggle — persisted so the user's choice sticks across
  // sessions. Default: Week on narrow screens, Month on desktop.
  const [calView, setCalView] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("calendarView") : null;
    if (saved === "week" || saved === "month") return saved;
    return typeof window !== "undefined" && window.innerWidth < 768 ? "week" : "month";
  });
  useEffect(() => {
    try { localStorage.setItem("calendarView", calView); } catch { /* ignore */ }
  }, [calView]);
  // Which row of the monthly grid to show in week view
  const [weekIndex, setWeekIndex] = useState(0);
  const [bills, setBills] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [billPayments, setBillPayments] = useState([]);
  const [oneTimeIncomes, setOneTimeIncomes] = useState([]);
  const [paydayDates, setPaydayDates] = useState([]);
  const [paymentPlans, setPaymentPlans] = useState([]);
  const [savingsTxns, setSavingsTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const userCreatedAt = (() => { try { const u = JSON.parse(localStorage.getItem("user")); return u?.createdAt; } catch { return null; } })();

  // Day-detail state
  const [expForm, setExpForm] = useState({ description: "", amount: "", category: "Food" });
  const [expSaving, setExpSaving] = useState(false);
  const [editBill, setEditBill] = useState(null);
  const [overrideForm, setOverrideForm] = useState({ amount: "", note: "" });
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(null);
  const [paidForm, setPaidForm] = useState({ paidDate: "", note: "", amount: "" });
  const [paidSaving, setPaidSaving] = useState(false);
  const [payingEarly, setPayingEarly] = useState(null);
  const [incForm, setIncForm] = useState({ name: "", amount: "" });
  const [incSaving, setIncSaving] = useState(false);

  // Paydays fetched from backend (single source of truth)

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const goNext = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); } else { setViewMonth((m) => m + 1); } };
  const goPrev = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); } else { setViewMonth((m) => m - 1); } };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const from = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
      const to = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const [b, e, o, bp, oti, pp, sv] = await Promise.all([
        authFetch("/api/bills"),
        authFetch(`/api/expenses?from=${from}&to=${to}`),
        authFetch(`/api/payment-overrides?from=${from}&to=${to}`),
        authFetch(`/api/bill-payments?from=${from}&to=${to}`).catch(() => []),
        authFetch(`/api/one-time-income?from=${from}&to=${to}`).catch(() => []),
        authFetch("/api/payment-plans").catch(() => []),
        authFetch(`/api/savings/transactions?startDate=${from}&endDate=${to}`).catch(() => []),
      ]);
      setBills(Array.isArray(b) ? b : []);
      setExpenses(Array.isArray(e) ? e : []);
      setOverrides(Array.isArray(o) ? o : []);
      setBillPayments(Array.isArray(bp) ? bp : []);
      setOneTimeIncomes(Array.isArray(oti) ? oti : []);
      setPaymentPlans(Array.isArray(pp) ? pp : []);
      setSavingsTxns(Array.isArray(sv) ? sv : []);
      // Load paydays from backend
      authFetch(`/api/summary/paydays?from=${from}&to=${to}`).then((d) => setPaydayDates(d?.paydays || [])).catch(() => setPaydayDates([]));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [viewYear, viewMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  // Paydays from backend (single source of truth)
  const paydaySet = useMemo(() => {
    return new Set(paydayDates);
  }, [paydayDates]);

  // Lookup maps
  const billsByDay = useMemo(() => {
    const map = {};
    bills.forEach((b) => {
      const day = b.dueDayOfMonth || b.dueDay;
      if (!day) return;
      const cellDate = new Date(viewYear, viewMonth, day);
      // Skip if before startDate
      if (b.startDate) {
        const sd = new Date(b.startDate);
        const sdLocal = new Date(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate());
        if (cellDate < sdLocal) return;
      }
      // Skip if after lastPaymentDate
      if (b.lastPaymentDate) {
        const lp = new Date(b.lastPaymentDate);
        const lpLocal = new Date(lp.getUTCFullYear(), lp.getUTCMonth(), lp.getUTCDate());
        if (cellDate > lpLocal) return;
      }
      const key = toKey(viewYear, viewMonth, day);
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
    return map;
  }, [bills, viewYear, viewMonth]);

  const expensesByDay = useMemo(() => {
    const map = {};
    expenses.forEach((e) => {
      if (!e.date) return;
      const dt = new Date(e.date);
      const key = toKey(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [expenses]);

  const overrideMap = useMemo(() => {
    const map = {};
    overrides.forEach((o) => {
      const dt = new Date(o.date);
      map[`${o.bill}_${toKey(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())}`] = o;
    });
    return map;
  }, [overrides]);

  // One-time income by day
  const incomeByDay = useMemo(() => {
    const map = {};
    oneTimeIncomes.forEach((i) => {
      const dt = new Date(i.date);
      const key = toKey(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
      if (!map[key]) map[key] = [];
      map[key].push(i);
    });
    return map;
  }, [oneTimeIncomes]);

  // Payment plans flattened by day. planId + paymentId are preserved so
  // the SideSheet can drive the §7 PaidToggle directly against the
  // canonical PATCH endpoint.
  const ppByDay = useMemo(() => {
    const map = {};
    paymentPlans.forEach((plan) => {
      (plan.payments || []).forEach((p) => {
        const dt = new Date(p.date);
        const key = toKey(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
        if (!map[key]) map[key] = [];
        map[key].push({
          planId: plan._id,
          paymentId: p.id,
          planName: plan.name,
          amount: p.amount,
          paid: p.paid,
        });
      });
    });
    return map;
  }, [paymentPlans]);

  // Savings transactions by day — separate deposit/withdrawal lookups
  const savingsDepositsByDay = useMemo(() => {
    const map = {};
    savingsTxns.forEach((t) => {
      if (t.type !== "deposit") return;
      const dt = new Date(t.date);
      const key = toKey(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [savingsTxns]);
  const savingsWithdrawalsByDay = useMemo(() => {
    const map = {};
    savingsTxns.forEach((t) => {
      if (t.type !== "withdrawal") return;
      const dt = new Date(t.date);
      const key = toKey(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [savingsTxns]);

  // Bill payments lookup: "billId_YYYY-MM-DD" => payment object
  const paidMap = useMemo(() => {
    const map = {};
    billPayments.forEach((p) => {
      const dt = new Date(p.dueDate);
      const key = `${p.bill}_${toKey(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())}`;
      map[key] = p;
    });
    return map;
  }, [billPayments]);

  const isBillPaid = (billId, dateKey) => !!paidMap[`${billId}_${dateKey}`];
  const isBillBeforeTracking = (dateKey) => {
    if (!userCreatedAt) return false;
    const ca = new Date(userCreatedAt);
    const caLocal = new Date(ca.getUTCFullYear(), ca.getUTCMonth(), ca.getUTCDate());
    const [y, m, d] = dateKey.split("-").map(Number);
    return new Date(y, m - 1, d) < caLocal;
  };
  const getBillPayment = (billId, dateKey) => paidMap[`${billId}_${dateKey}`];

  const weeks = buildMonthGrid(viewYear, viewMonth);

  // Whenever the user switches into week view or navigates the month,
  // pick a sensible default week: the one containing today if we're on
  // the current month, otherwise the first row with a real day in it.
  useEffect(() => {
    if (calView !== "week") return;
    const isCurrent = viewYear === today.getFullYear() && viewMonth === today.getMonth();
    if (isCurrent) {
      const t = today.getDate();
      const idx = weeks.findIndex((w) => w.includes(t));
      if (idx >= 0) { setWeekIndex(idx); return; }
    }
    const firstReal = weeks.findIndex((w) => w.some((d) => d !== null));
    setWeekIndex(Math.max(0, firstReal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calView, viewYear, viewMonth]);

  const getEffectiveAmount = (bill, dateKey) => {
    const oKey = `${bill._id}_${dateKey}`;
    if (overrideMap[oKey]) return overrideMap[oKey].amount;
    if (bill.lastPaymentDate && bill.lastPaymentAmount != null) {
      const lp = new Date(bill.lastPaymentDate);
      if (toKey(lp.getUTCFullYear(), lp.getUTCMonth(), lp.getUTCDate()) === dateKey) return bill.lastPaymentAmount;
    }
    return bill.amount;
  };

  const isFutureMonth = viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth > today.getMonth());
  const locked = isFutureMonth && !hasPremiumAccess;

  // Load paycheck snapshot when clicking a payday
  const loadSnapshot = useCallback(async (dateKey) => {
    setSnapshotLoading(true);
    setSnapshot(null);
    try {
      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const data = await authFetch(`/api/summary/projected-balance?paydayDate=${dateKey}&localDate=${localDate}`);
      setSnapshot(data);
    } catch (err) {
      console.error("Snapshot error:", err);
      setSnapshot(null);
    } finally {
      setSnapshotLoading(false);
    }
  }, []);

  const handleDayClick = (key, isPayday) => {
    setSelectedDay(key);
    setEditBill(null);
    setSnapshot(null);
    if (isPayday) loadSnapshot(key);
  };

  const handleAddDayExpense = async (e) => {
    e.preventDefault();
    if (!selectedDay || !expForm.amount) return;
    setExpSaving(true);
    try {
      await authFetch("/api/expenses", { method: "POST", body: JSON.stringify({ date: selectedDay, amount: Number(expForm.amount), category: expForm.category, description: expForm.description }) });
      setExpForm({ description: "", amount: "", category: "Food" });
      loadData();
      cache?.fetchSummary?.(true);
      // Toast: first expense of current period
      try {
        const p = cache?.summary?.period;
        if (p?.start && p?.end) {
          const s = new Date(p.start);
          const e = new Date(p.end);
          const from = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
          const to = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, "0")}-${String(e.getDate()).padStart(2, "0")}`;
          const res = await authFetch(`/api/expenses?from=${from}&to=${to}&excludeSavings=true&limit=2&page=1`);
          const count = res?.total ?? (Array.isArray(res) ? res.length : 0);
          if (count === 1) {
            const fn = getFirstName();
            toast?.showToast?.(`Period started. Stay on top of it${fn ? `, ${fn}` : ""}.`);
          }
        }
      } catch { /* non-critical */ }
    } catch (err) { console.error(err); }
    finally { setExpSaving(false); }
  };

  const handleSaveOverride = async (e) => {
    e.preventDefault();
    if (!editBill || !overrideForm.amount) return;
    setOverrideSaving(true);
    try {
      await authFetch("/api/payment-overrides", { method: "POST", body: JSON.stringify({ billId: editBill._id, date: selectedDay, amount: Number(overrideForm.amount), note: overrideForm.note }) });
      setEditBill(null);
      setOverrideForm({ amount: "", note: "" });
      loadData();
      cache?.fetchSummary?.(true);
    } catch (err) { console.error(err); }
    finally { setOverrideSaving(false); }
  };

  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const handleMarkPaid = async (e) => {
    e.preventDefault();
    if (!markingPaid || !paidForm.paidDate) return;
    setPaidSaving(true);
    try {
      await authFetch("/api/bill-payments", {
        method: "POST",
        body: JSON.stringify({
          billId: markingPaid._id,
          dueDate: selectedDay,
          paidDate: paidForm.paidDate,
          paidAmount: getEffectiveAmount(markingPaid, selectedDay),
          note: paidForm.note,
        }),
      });
      // Toast: early payment check (paid before due day this month)
      try {
        const dueDay = markingPaid.dueDayOfMonth || markingPaid.dueDay;
        if (dueDay) {
          const now = new Date();
          const dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
          const paidDate = new Date(paidForm.paidDate);
          if (paidDate < dueDate) {
            toast?.showToast?.(`${markingPaid.name} paid early. Stay ahead.`);
          }
        }
      } catch { /* non-critical */ }
      setMarkingPaid(null);
      setPaidForm({ paidDate: "", note: "" });
      loadData();
      cache?.fetchSummary?.(true);
    } catch (err) { console.error(err); }
    finally { setPaidSaving(false); }
  };

  const handleAddIncome = async (e) => {
    e.preventDefault();
    if (!selectedDay || !incForm.amount || !incForm.name) return;
    setIncSaving(true);
    try {
      await authFetch("/api/one-time-income", { method: "POST", body: JSON.stringify({ name: incForm.name, amount: Number(incForm.amount), date: selectedDay }) });
      setIncForm({ name: "", amount: "" });
      loadData();
      cache?.fetchSummary?.(true);
    } catch { /* ignore */ }
    finally { setIncSaving(false); }
  };

  const dayBills = selectedDay ? billsByDay[selectedDay] || [] : [];
  const dayExpenses = selectedDay ? expensesByDay[selectedDay] || [] : [];
  const daySavingsDeposits = selectedDay ? savingsDepositsByDay[selectedDay] || [] : [];
  const daySavingsWithdrawals = selectedDay ? savingsWithdrawalsByDay[selectedDay] || [] : [];
  const dayIncomes = selectedDay ? incomeByDay[selectedDay] || [] : [];
  const dayPlanPayments = selectedDay ? ppByDay[selectedDay] || [] : [];
  const isSelectedPayday = selectedDay ? paydaySet.has(selectedDay) : false;
  const daySpendingOnly = dayExpenses.filter((exp) => !/^savings$/i.test(exp.category || ""));
  const sumAmt = (arr) => arr.reduce((s, x) => s + Number(x.amount || 0), 0);
  const closeSheet = () => {
    setSelectedDay(null);
    setEditBill(null);
    setMarkingPaid(null);
    setPayingEarly(null);
    setSnapshot(null);
  };
  const dayTitle = selectedDay
    ? new Date(selectedDay + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <PageContainer>
      <div className="pp5-page-header">
        <h1 className="type-display">Calendar</h1>
        <p className="pp5-page-subtitle">Your money mapped across the month.</p>
      </div>
      <div className="calendar-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
        <div className="pp5-segmented" role="tablist" aria-label="Calendar view">
          <button type="button" className={calView === "week" ? "active" : ""} onClick={() => setCalView("week")}>Week</button>
          <button type="button" className={calView === "month" ? "active" : ""} onClick={() => setCalView("month")}>Month</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" className="pp5-btn pp5-btn-secondary pp5-btn-sm" onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }}>Today</button>
          <button type="button" className="cal-nav-btn" onClick={goPrev} aria-label="Previous">‹</button>
          <span className="type-title" style={{ minWidth: 180, textAlign: "center" }}>{monthLabel}</span>
          <button type="button" className="cal-nav-btn" onClick={goNext} aria-label="Next">›</button>
        </div>
      </div>

      {!hasPremiumAccess && isFutureMonth && (
        <div className="cal-toolbar"><span className="premium-badge">Premium required for future months</span></div>
      )}

      {loading && <p className="pp5-empty">Loading…</p>}

      {locked ? (
        <div className="premium-lock">
          <p>Projected months are a premium feature.</p>
          <button type="button" className="pp5-btn pp5-btn-primary">Upgrade</button>
        </div>
      ) : (
        <div className="cal-grid-wrapper">
          <div className="cal-weekdays">
            {WEEKDAYS.map((d) => (<div key={d} className="cal-weekday">{d}</div>))}
          </div>
          {(calView === "week" ? [weeks[weekIndex] || weeks[0] || []] : weeks).map((week, wi) => (
            <div key={wi} className="cal-week">
              {week.map((day, di) => {
                if (day === null) return <div key={di} className="cal-cell empty" />;
                const key = toKey(viewYear, viewMonth, day);
                const db = billsByDay[key] || [];
                const de = expensesByDay[key] || [];
                const isPayday = paydaySet.has(key);
                const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                // Split savings from spending — savings show in teal, expenses in red
                const isSavings = (x) => /^savings$/i.test(x.category || "");
                const savingsEntries = de.filter(isSavings);
                const spendingEntries = de.filter((x) => !isSavings(x));
                const expTotal = spendingEntries.reduce((s, x) => s + Number(x.amount || 0), 0);
                const savTotal = savingsEntries.reduce((s, x) => s + Number(x.amount || 0), 0);

                return (
                  <button key={di} type="button"
                    className={`cal-cell${isToday ? " today" : ""}${isPayday ? " payday-cell" : ""}`}
                    onClick={() => handleDayClick(key, isPayday)}
                  >
                    <span className="cal-day-num">
                      {day}
                      {isPayday && <span className="cal-payday-dot" />}
                    </span>
                    {db.map((b) => {
                      const paid = isBillPaid(b._id, key);
                      const priorToTracking = isBillBeforeTracking(key);
                      const amount = currency.format(getEffectiveAmount(b, key));
                      // §8: paid bills display the amount with strike-
                      // through; no "Paid" pill, no separate badge. The
                      // bill-dot + class carry the state.
                      const cls = paid || priorToTracking
                        ? "cal-bill-tag pp-amount pp-amount--paid"
                        : "cal-bill-tag";
                      return (
                        <span key={b._id} className={cls} title={paid ? "Paid" : undefined}>
                          <span className="cal-bill-dot" />{amount}
                        </span>
                      );
                    })}
                    {expTotal > 0 && (
                      <span className="cal-exp-tag"><span className="cal-exp-dot" />{currency.format(expTotal)}</span>
                    )}
                    {savTotal > 0 && (
                      <span className="cal-savings-tag"><span className="cal-savings-dot" />{currency.format(savTotal)}</span>
                    )}
                    {(incomeByDay[key] || []).length > 0 && (
                      <span className="cal-income-tag"><span className="cal-income-dot" />+{currency.format((incomeByDay[key] || []).reduce((s, i) => s + Number(i.amount || 0), 0))}</span>
                    )}
                    {(ppByDay[key] || []).map((pp, pi) => (
                      <span
                        key={pi}
                        className={`cal-bill-tag${pp.paid ? " pp-amount pp-amount--paid" : ""}`}
                      >
                        <span className="cal-bill-dot" />{currency.format(pp.amount)}
                      </span>
                    ))}
                  </button>
                );
              })}
            </div>
          ))}

          {calView === "week" && (
            <div className="cal-week-nav" style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="ghost-button"
                disabled={weekIndex <= 0}
                onClick={() => setWeekIndex((i) => Math.max(0, i - 1))}
                style={{ flex: 1 }}
              >
                &larr; Prev week
              </button>
              <button
                type="button"
                className="ghost-button"
                disabled={weekIndex >= weeks.length - 1}
                onClick={() => setWeekIndex((i) => Math.min(weeks.length - 1, i + 1))}
                style={{ flex: 1 }}
              >
                Next week &rarr;
              </button>
            </div>
          )}
        </div>
      )}

      <SideSheet
        open={!!selectedDay}
        onClose={closeSheet}
        title={dayTitle}
        subtitle={isSelectedPayday ? "Payday" : undefined}
      >
        {isSelectedPayday && (
          <div className="pp-sheet-snapshot has-inset-highlight">
            <h4 className="pp-sheet-snapshot-title">Paycheck snapshot</h4>
            {snapshotLoading ? (
              <p className="pp-sheet-empty">Calculating projection…</p>
            ) : snapshot ? (
              <>
                <div className="pp-sheet-snapshot-row"><span>Paycheck amount</span><span>{currency.format(snapshot.paycheckAmount || 0)}</span></div>
                <div className="pp-sheet-snapshot-row"><span>{snapshot.isFirstPeriod ? "Opening balance" : "Rollover"}</span><span>{currency.format(snapshot.rollover || 0)}</span></div>
                <div className="pp-sheet-snapshot-row is-positive"><span>Total available</span><span>{currency.format(snapshot.totalAvailable || 0)}</span></div>
                <div className="pp-sheet-snapshot-row is-negative"><span>Bills this period</span><span>&minus;{currency.format(snapshot.billsThisPeriod || 0)}</span></div>
                {(snapshot.plansDueThisPeriod || 0) > 0 && (
                  <div className="pp-sheet-snapshot-row is-negative"><span>Payment plans</span><span>&minus;{currency.format(snapshot.plansDueThisPeriod)}</span></div>
                )}
                <div className="pp-sheet-snapshot-row is-negative"><span>Expenses this period</span><span>&minus;{currency.format(snapshot.expensesThisPeriod || 0)}</span></div>
                <div className={`pp-sheet-snapshot-row is-total ${(snapshot.balance ?? snapshot.estimatedBalance ?? 0) >= 0 ? "is-positive" : "is-negative"}`}>
                  <span>Balance</span><span>{currency.format(snapshot.balance ?? snapshot.estimatedBalance ?? 0)}</span>
                </div>
              </>
            ) : (
              <p className="pp-sheet-empty">Unable to load projection.</p>
            )}
          </div>
        )}

        {/* 1. Income */}
        <section className="pp-sheet-section">
          <header className="pp-sheet-section-head">
            <h3 className="pp-sheet-section-title">Income</h3>
            {(dayIncomes.length + daySavingsWithdrawals.length) > 0 && (
              <span className="pp-sheet-section-total">+{currency.format(sumAmt(dayIncomes) + sumAmt(daySavingsWithdrawals))}</span>
            )}
          </header>
          {dayIncomes.length === 0 && daySavingsWithdrawals.length === 0 ? (
            <p className="pp-sheet-empty">No income recorded.</p>
          ) : (
            <>
              {dayIncomes.map((inc) => (
                <div key={inc._id} className="pp-sheet-row">
                  <div className="pp-sheet-row-main">
                    <span className="pp-sheet-row-name">{inc.name}</span>
                    <span className="pp-sheet-row-meta">One-time income</span>
                  </div>
                  <span className="pp-sheet-row-amt is-positive">+{currency.format(inc.amount)}</span>
                </div>
              ))}
              {daySavingsWithdrawals.map((t) => (
                <div key={t._id} className="pp-sheet-row">
                  <div className="pp-sheet-row-main">
                    <span className="pp-sheet-row-name">{t.goalNameSnapshot}</span>
                    <span className="pp-sheet-row-meta">Savings withdrawal</span>
                  </div>
                  <span className="pp-sheet-row-amt is-positive">+{currency.format(t.amount)}</span>
                </div>
              ))}
            </>
          )}
          <form className="pp-sheet-form" onSubmit={handleAddIncome}>
            <h4 className="pp-sheet-form-title">Add income</h4>
            <div className="pp-sheet-field">
              <label className="pp-sheet-field-label" htmlFor="cal-inc-source">Source</label>
              <input
                id="cal-inc-source"
                type="text"
                placeholder="Where did this come from?"
                value={incForm.name}
                onChange={(e) => setIncForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div className="pp-sheet-field">
              <label className="pp-sheet-field-label" htmlFor="cal-inc-amount">Amount</label>
              <input
                id="cal-inc-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                placeholder="$0.00"
                value={incForm.amount}
                onChange={(e) => setIncForm((p) => ({ ...p, amount: e.target.value }))}
                required
              />
            </div>
            <div className="pp-sheet-form-actions">
              <button type="submit" className="pp-sheet-btn pp-sheet-btn-primary" disabled={incSaving}>
                {incSaving ? "Saving…" : "Add income"}
              </button>
            </div>
          </form>
        </section>

        {/* 2. Bills */}
        <section className="pp-sheet-section">
          <header className="pp-sheet-section-head">
            <h3 className="pp-sheet-section-title">Bills</h3>
            {dayBills.length > 0 && (
              <span className="pp-sheet-section-total">{currency.format(dayBills.reduce((s, b) => s + Number(getEffectiveAmount(b, selectedDay) || 0), 0))}</span>
            )}
          </header>
          {dayBills.length === 0 ? (
            <p className="pp-sheet-empty">No bills due.</p>
          ) : (
            dayBills.map((b) => {
              const amt = getEffectiveAmount(b, selectedDay);
              const payment = getBillPayment(b._id, selectedDay);
              const priorToTracking = isBillBeforeTracking(selectedDay);
              const hasOverride = !!overrideMap[`${b._id}_${selectedDay}`];
              const isPaid = !!payment || priorToTracking;
              return (
                <div key={b._id} className={`pp-sheet-row${isPaid ? " is-paid" : ""}`} style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" }}>
                    <div className="pp-sheet-row-main">
                      <span className="pp-sheet-row-name">{b.name}</span>
                      {/* §8: strikethrough on the amount already
                          communicates "paid". Meta line now carries
                          the paid-date or the context; no "Paid" text. */}
                      {payment ? (
                        <span className="pp-sheet-row-meta">
                          {new Date(payment.paidDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      ) : priorToTracking ? (
                        <span className="pp-sheet-row-meta">Before tracking started</span>
                      ) : hasOverride ? (
                        <span className="pp-sheet-row-meta">Edited for this month</span>
                      ) : null}
                    </div>
                    <span className={`pp-sheet-row-amt pp-amount${isPaid ? " pp-amount--paid is-paid" : ""}`}>{currency.format(amt)}</span>
                  </div>
                  <div className="pp-sheet-row-actions">
                    <PaidToggle
                      paid={isPaid}
                      label={`${b.name}, ${currency.format(amt)}, due ${selectedDay}`}
                      onToggle={async () => {
                        try {
                          await authFetch(`/api/bills/${b._id}/paid`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              paid: !isPaid,
                              dueDate: selectedDay,
                              paidDate: todayKey(),
                              paidAmount: Number(amt),
                            }),
                          });
                          loadData();
                          cache?.fetchSummary?.(true);
                        } catch { /* ignore */ }
                      }}
                    />
                    {!isPaid && (
                      <>
                        <button type="button" className="pp-sheet-row-action is-muted" onClick={() => { setEditBill(b); setOverrideForm({ amount: String(amt), note: "" }); }}>Edit amount</button>
                        <button type="button" className="pp-sheet-row-action is-muted" onClick={() => { setPayingEarly(b); setPaidForm({ paidDate: todayKey(), note: "", amount: String(amt) }); }}>Pay early</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {markingPaid && (
            <form className="pp-sheet-form" onSubmit={handleMarkPaid}>
              <h4 className="pp-sheet-form-title">Mark <span style={{ color: "var(--color-accent-teal)" }}>{markingPaid.name}</span> as paid</h4>
              <div className="pp-sheet-field">
                <label className="pp-sheet-field-label">When did you pay it?</label>
                <input type="date" value={paidForm.paidDate} onChange={(e) => setPaidForm((p) => ({ ...p, paidDate: e.target.value }))} required />
              </div>
              <div className="pp-sheet-field">
                <label className="pp-sheet-field-label">Note (optional)</label>
                <input type="text" value={paidForm.note} onChange={(e) => setPaidForm((p) => ({ ...p, note: e.target.value }))} />
              </div>
              <div className="pp-sheet-form-actions">
                <button type="button" className="pp-sheet-btn pp-sheet-btn-ghost" onClick={() => setMarkingPaid(null)}>Cancel</button>
                <button type="submit" className="pp-sheet-btn pp-sheet-btn-primary" disabled={paidSaving}>{paidSaving ? "Saving…" : "Save"}</button>
              </div>
            </form>
          )}

          {payingEarly && (
            <form
              className="pp-sheet-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setPaidSaving(true);
                try {
                  await authFetch("/api/bill-payments", {
                    method: "POST",
                    body: JSON.stringify({
                      billId: payingEarly._id,
                      dueDate: selectedDay,
                      paidDate: paidForm.paidDate,
                      paidAmount: Number(paidForm.amount),
                      note: paidForm.note || `Early payment — due ${selectedDay}`,
                    }),
                  });
                  setPayingEarly(null);
                  setPaidForm({ paidDate: "", note: "", amount: "" });
                  loadData();
                  cache?.fetchSummary?.(true);
                } catch { /* ignore */ }
                finally { setPaidSaving(false); }
              }}
            >
              <h4 className="pp-sheet-form-title">Pay <span style={{ color: "var(--color-accent-teal)" }}>{payingEarly.name}</span> early</h4>
              <p className="pp-sheet-form-hint">Due {selectedDay}</p>
              <div className="pp-sheet-field">
                <label className="pp-sheet-field-label">Amount</label>
                <input type="number" step="0.01" value={paidForm.amount} onChange={(e) => setPaidForm((p) => ({ ...p, amount: e.target.value }))} required />
              </div>
              <div className="pp-sheet-field">
                <label className="pp-sheet-field-label">Date paid</label>
                <input type="date" value={paidForm.paidDate} onChange={(e) => setPaidForm((p) => ({ ...p, paidDate: e.target.value }))} required />
              </div>
              <div className="pp-sheet-field">
                <label className="pp-sheet-field-label">Note (optional)</label>
                <input type="text" value={paidForm.note} onChange={(e) => setPaidForm((p) => ({ ...p, note: e.target.value }))} />
              </div>
              <div className="pp-sheet-form-actions">
                <button type="button" className="pp-sheet-btn pp-sheet-btn-ghost" onClick={() => setPayingEarly(null)}>Cancel</button>
                <button type="submit" className="pp-sheet-btn pp-sheet-btn-primary" disabled={paidSaving}>{paidSaving ? "Saving…" : "Confirm early payment"}</button>
              </div>
            </form>
          )}

          {editBill && (
            <form className="pp-sheet-form" onSubmit={handleSaveOverride}>
              <h4 className="pp-sheet-form-title">Edit amount for <span style={{ color: "var(--color-accent-teal)" }}>{editBill.name}</span></h4>
              <p className="pp-sheet-form-hint">This month only — {selectedDay}</p>
              <div className="pp-sheet-field">
                <label className="pp-sheet-field-label">Amount</label>
                <input type="number" step="0.01" value={overrideForm.amount} onChange={(e) => setOverrideForm((p) => ({ ...p, amount: e.target.value }))} required />
              </div>
              <div className="pp-sheet-field">
                <label className="pp-sheet-field-label">Note (optional)</label>
                <input type="text" value={overrideForm.note} onChange={(e) => setOverrideForm((p) => ({ ...p, note: e.target.value }))} />
              </div>
              <div className="pp-sheet-form-actions">
                <button type="button" className="pp-sheet-btn pp-sheet-btn-ghost" onClick={() => setEditBill(null)}>Cancel</button>
                <button type="submit" className="pp-sheet-btn pp-sheet-btn-primary" disabled={overrideSaving}>{overrideSaving ? "Saving…" : "Save this payment only"}</button>
              </div>
            </form>
          )}
        </section>

        {/* 3. Payment plans */}
        <section className="pp-sheet-section">
          <header className="pp-sheet-section-head">
            <h3 className="pp-sheet-section-title">Payment plans</h3>
            {dayPlanPayments.length > 0 && (
              <span className="pp-sheet-section-total">{currency.format(sumAmt(dayPlanPayments))}</span>
            )}
          </header>
          {dayPlanPayments.length === 0 ? (
            <p className="pp-sheet-empty">No plan payments due.</p>
          ) : (
            dayPlanPayments.map((pp, i) => (
              <div key={pp.paymentId || i} className={`pp-sheet-row${pp.paid ? " is-paid" : ""}`} style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" }}>
                  <div className="pp-sheet-row-main">
                    <span className="pp-sheet-row-name">{pp.planName}</span>
                    {/* §8: strikethrough on the amount is the paid
                        indicator; no "Paid" meta text. */}
                  </div>
                  <span className={`pp-sheet-row-amt pp-amount${pp.paid ? " pp-amount--paid is-paid" : ""}`}>
                    {currency.format(pp.amount)}
                  </span>
                </div>
                {pp.planId && pp.paymentId && (
                  <div className="pp-sheet-row-actions">
                    <PaidToggle
                      paid={!!pp.paid}
                      label={`${pp.planName} payment, ${currency.format(pp.amount)}, due ${selectedDay}`}
                      onToggle={async () => {
                        try {
                          await authFetch(`/api/payment-plans/${pp.planId}/payments/${pp.paymentId}/paid`, {
                            method: "PATCH",
                            body: JSON.stringify({ paid: !pp.paid }),
                          });
                          loadData();
                          cache?.fetchSummary?.(true);
                        } catch { /* ignore */ }
                      }}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </section>

        {/* 4. Expenses */}
        <section className="pp-sheet-section">
          <header className="pp-sheet-section-head">
            <h3 className="pp-sheet-section-title">Expenses</h3>
            {daySpendingOnly.length > 0 && (
              <span className="pp-sheet-section-total">{currency.format(sumAmt(daySpendingOnly))}</span>
            )}
          </header>
          {daySpendingOnly.length === 0 ? (
            <p className="pp-sheet-empty">No expenses.</p>
          ) : (
            daySpendingOnly.map((exp, i) => (
              <div key={exp._id || i} className={`pp-sheet-row${exp.paid ? " is-paid" : ""}`} style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%" }}>
                  <div className="pp-sheet-row-main">
                    <span className="pp-sheet-row-name">{exp.description || exp.category || "Expense"}</span>
                    {exp.category && <span className="pp-sheet-row-meta">{exp.category}</span>}
                  </div>
                  <span className={`pp-sheet-row-amt pp-amount${exp.paid ? " pp-amount--paid is-paid" : ""}`}>
                    {currency.format(exp.amount)}
                  </span>
                </div>
                {exp._id && (
                  <div className="pp-sheet-row-actions">
                    <PaidToggle
                      paid={!!exp.paid}
                      label={`${exp.description || exp.category || "Expense"}, ${currency.format(exp.amount)}`}
                      onToggle={async () => {
                        try {
                          await authFetch(`/api/expenses/${exp._id}/paid`, {
                            method: "PATCH",
                            body: JSON.stringify({ paid: !exp.paid }),
                          });
                          loadData();
                          cache?.fetchSummary?.(true);
                        } catch { /* ignore */ }
                      }}
                    />
                  </div>
                )}
              </div>
            ))
          )}
          <form className="pp-sheet-form" onSubmit={handleAddDayExpense}>
            <h4 className="pp-sheet-form-title">Add expense</h4>
            <div className="pp-sheet-field">
              <label className="pp-sheet-field-label" htmlFor="cal-exp-desc">Description</label>
              <input
                id="cal-exp-desc"
                type="text"
                placeholder={expForm.category === "Other" ? "What is this for?" : "Optional"}
                value={expForm.description}
                onChange={(e) => setExpForm((p) => ({ ...p, description: e.target.value }))}
                required={expForm.category === "Other"}
              />
            </div>
            <div className="pp-sheet-field">
              <label className="pp-sheet-field-label" htmlFor="cal-exp-amount">Amount</label>
              <input
                id="cal-exp-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                placeholder="$0.00"
                value={expForm.amount}
                onChange={(e) => setExpForm((p) => ({ ...p, amount: e.target.value }))}
                required
              />
            </div>
            <div className="pp-sheet-field">
              <label className="pp-sheet-field-label">Category</label>
              <div className="qa-chips" role="group" aria-label="Category">
                {QUICK_CHIPS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`qa-chip${expForm.category === c ? " active" : ""}`}
                    onClick={() => setExpForm((p) => ({ ...p, category: c }))}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="pp-sheet-form-actions">
              <button type="submit" className="pp-sheet-btn pp-sheet-btn-primary" disabled={expSaving}>
                {expSaving ? "Saving…" : "Add expense"}
              </button>
            </div>
          </form>
        </section>

        {/* 5. Savings deposits */}
        <section className="pp-sheet-section">
          <header className="pp-sheet-section-head">
            <h3 className="pp-sheet-section-title">Savings deposits</h3>
            {daySavingsDeposits.length > 0 && (
              <span className="pp-sheet-section-total">{currency.format(sumAmt(daySavingsDeposits))}</span>
            )}
          </header>
          {daySavingsDeposits.length === 0 ? (
            <p className="pp-sheet-empty">No deposits.</p>
          ) : (
            daySavingsDeposits.map((t) => (
              <div key={t._id} className="pp-sheet-row">
                <div className="pp-sheet-row-main">
                  <span className="pp-sheet-row-name">{t.goalNameSnapshot}</span>
                  <span className="pp-sheet-row-meta">Goal deposit</span>
                </div>
                <span className="pp-sheet-row-amt is-positive">+{currency.format(t.amount)}</span>
              </div>
            ))
          )}
        </section>
      </SideSheet>
      </div>
    </PageContainer>
  );
};

export default Calendar;
