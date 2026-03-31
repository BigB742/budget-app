import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch } from "../apiClient";
import { useIncomeSources } from "../hooks/useIncomeSources";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// TODO: Replace with real subscription check when paywall is built
const isPremium = () => true;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CATEGORY_OPTIONS = [
  { value: "Food", label: "\ud83c\udf54 Food" },
  { value: "Dining Out", label: "\ud83c\udf7d\ufe0f Dining Out" },
  { value: "Entertainment", label: "\ud83c\udfac Entertainment" },
  { value: "Gas", label: "\u26fd Gas" },
  { value: "Groceries", label: "\ud83d\uded2 Groceries" },
  { value: "Home", label: "\ud83c\udfe0 Home" },
  { value: "Health", label: "\ud83d\udc8a Health" },
  { value: "Shopping", label: "\ud83d\udc57 Shopping" },
  { value: "Travel", label: "\u2708\ufe0f Travel" },
  { value: "Subscriptions", label: "\ud83d\udce6 Subscriptions" },
  { value: "Other", label: "\ud83d\udcb8 Other" },
];

const toKey = (y, m, d) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const buildMonthGrid = (year, month) => {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = [];
  let week = new Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
};

const Calendar = () => {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [bills, setBills] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [showFuture, setShowFuture] = useState(false);

  // Day-detail state
  const [expForm, setExpForm] = useState({ description: "", amount: "", category: "Food" });
  const [expSaving, setExpSaving] = useState(false);
  const [editBill, setEditBill] = useState(null);
  const [overrideForm, setOverrideForm] = useState({ amount: "", note: "" });
  const [overrideSaving, setOverrideSaving] = useState(false);

  const { sources } = useIncomeSources();

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const goNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const from = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
      const to = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const [b, e, o] = await Promise.all([
        authFetch("/api/bills"),
        authFetch(`/api/expenses?from=${from}&to=${to}`),
        authFetch(`/api/payment-overrides?from=${from}&to=${to}`),
      ]);
      setBills(Array.isArray(b) ? b : []);
      setExpenses(Array.isArray(e) ? e : []);
      setOverrides(Array.isArray(o) ? o : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [viewYear, viewMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute paydays for this month from income sources
  const paydaySet = useMemo(() => {
    const set = new Set();
    (sources || []).forEach((src) => {
      if (!src.nextPayDate || !src.frequency) return;
      const raw = new Date(src.nextPayDate);
      const anchor = new Date(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate());
      const step =
        src.frequency === "weekly" ? 7 : src.frequency === "biweekly" ? 14 : 0;

      if (step > 0) {
        let cursor = new Date(anchor);
        const monthStart = new Date(viewYear, viewMonth, 1);
        const monthEnd = new Date(viewYear, viewMonth + 1, 0);
        while (cursor > monthStart) cursor = new Date(cursor.getTime() - step * 86400000);
        while (cursor <= monthEnd) {
          if (cursor >= monthStart) set.add(toKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
          cursor = new Date(cursor.getTime() + step * 86400000);
        }
      } else if (src.frequency === "monthly") {
        const d = anchor.getDate();
        set.add(toKey(viewYear, viewMonth, d));
      }
    });
    return set;
  }, [sources, viewYear, viewMonth]);

  // Build lookup maps
  const billsByDay = useMemo(() => {
    const map = {};
    bills.forEach((b) => {
      const day = b.dueDayOfMonth || b.dueDay;
      if (!day) return;
      // Check lastPaymentDate — skip if bill has expired before this month
      if (b.lastPaymentDate) {
        const lp = new Date(b.lastPaymentDate);
        const lpLocal = new Date(lp.getUTCFullYear(), lp.getUTCMonth(), lp.getUTCDate());
        const cellDate = new Date(viewYear, viewMonth, day);
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
      const d = e.date || e.createdAt;
      if (!d) return;
      const dt = new Date(d);
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
      const key = `${o.bill}_${toKey(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())}`;
      map[key] = o;
    });
    return map;
  }, [overrides]);

  const weeks = buildMonthGrid(viewYear, viewMonth);

  const getEffectiveAmount = (bill, dateKey) => {
    const oKey = `${bill._id}_${dateKey}`;
    if (overrideMap[oKey]) return overrideMap[oKey].amount;
    if (bill.lastPaymentDate && bill.lastPaymentAmount != null) {
      const lp = new Date(bill.lastPaymentDate);
      const lpKey = toKey(lp.getUTCFullYear(), lp.getUTCMonth(), lp.getUTCDate());
      if (lpKey === dateKey) return bill.lastPaymentAmount;
    }
    return bill.amount;
  };

  // Premium guard: blur future months for free users
  const isFutureMonth =
    viewYear > today.getFullYear() ||
    (viewYear === today.getFullYear() && viewMonth > today.getMonth());
  const locked = isFutureMonth && !isPremium() && !showFuture;

  // Add expense for a day
  const handleAddDayExpense = async (e) => {
    e.preventDefault();
    if (!selectedDay || !expForm.amount) return;
    setExpSaving(true);
    try {
      await authFetch("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          date: selectedDay,
          amount: Number(expForm.amount),
          category: expForm.category,
          description: expForm.description,
        }),
      });
      setExpForm({ description: "", amount: "", category: "Food" });
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setExpSaving(false);
    }
  };

  // Save payment override
  const handleSaveOverride = async (e) => {
    e.preventDefault();
    if (!editBill || !overrideForm.amount) return;
    setOverrideSaving(true);
    try {
      await authFetch("/api/payment-overrides", {
        method: "POST",
        body: JSON.stringify({
          billId: editBill._id,
          date: selectedDay,
          amount: Number(overrideForm.amount),
          note: overrideForm.note,
        }),
      });
      setEditBill(null);
      setOverrideForm({ amount: "", note: "" });
      loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setOverrideSaving(false);
    }
  };

  const dayBills = selectedDay ? billsByDay[selectedDay] || [] : [];
  const dayExpenses = selectedDay ? expensesByDay[selectedDay] || [] : [];

  return (
    <div className="calendar-page">
      {/* Header */}
      <div className="cal-header">
        <button type="button" className="cal-nav-btn" onClick={goPrev}>
          &larr;
        </button>
        <h2 className="cal-month-label">{monthLabel}</h2>
        <button type="button" className="cal-nav-btn" onClick={goNext}>
          &rarr;
        </button>
      </div>

      {/* Premium toggle */}
      <div className="cal-toolbar">
        <label className="cal-toggle">
          <input
            type="checkbox"
            checked={showFuture}
            onChange={(e) => setShowFuture(e.target.checked)}
          />
          <span>Future view</span>
        </label>
        {!isPremium() && (
          <span className="premium-badge">Premium</span>
        )}
      </div>

      {loading && <p className="status">Loading...</p>}

      {locked ? (
        <div className="premium-lock">
          <p>Future months are a premium feature.</p>
          <button type="button" className="primary-button">
            Upgrade to Premium
          </button>
        </div>
      ) : (
        <div className="cal-grid-wrapper">
          {/* Weekday headers */}
          <div className="cal-weekdays">
            {WEEKDAYS.map((d) => (
              <div key={d} className="cal-weekday">
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div key={wi} className="cal-week">
              {week.map((day, di) => {
                if (day === null) return <div key={di} className="cal-cell empty" />;
                const key = toKey(viewYear, viewMonth, day);
                const db = billsByDay[key] || [];
                const de = expensesByDay[key] || [];
                const isPayday = paydaySet.has(key);
                const isToday =
                  day === today.getDate() &&
                  viewMonth === today.getMonth() &&
                  viewYear === today.getFullYear();

                return (
                  <button
                    key={di}
                    type="button"
                    className={`cal-cell${isToday ? " today" : ""}`}
                    onClick={() => {
                      setSelectedDay(key);
                      setEditBill(null);
                    }}
                  >
                    <span className="cal-day-num">
                      {day}
                      {isPayday && <span className="cal-payday-dot" />}
                    </span>
                    {db.map((b) => (
                      <span key={b._id} className="cal-bill-tag">
                        {b.name} -{currency.format(getEffectiveAmount(b, key))}
                      </span>
                    ))}
                    {de.length > 0 && (
                      <span className="cal-exp-tag">
                        {de.length} exp &middot;{" "}
                        {currency.format(de.reduce((s, x) => s + Number(x.amount || 0), 0))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Day detail modal */}
      {selectedDay && (
        <div className="modal-overlay" onClick={() => setSelectedDay(null)}>
          <div className="modal-card cal-detail" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>{new Date(selectedDay + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</h4>
              <button type="button" className="ghost-button" onClick={() => setSelectedDay(null)}>
                &#x2715;
              </button>
            </div>

            {/* Bills */}
            {dayBills.length > 0 && (
              <div className="cal-detail-section">
                <h5>Bills</h5>
                {dayBills.map((b) => {
                  const amt = getEffectiveAmount(b, selectedDay);
                  const oKey = `${b._id}_${selectedDay}`;
                  const hasOverride = !!overrideMap[oKey];
                  return (
                    <div key={b._id} className="cal-detail-row bill-row">
                      <div>
                        <strong>{b.name}</strong>
                        <span className="cal-detail-amt bill-amt">
                          {currency.format(amt)}
                        </span>
                        {hasOverride && <span className="pill">Edited</span>}
                      </div>
                      <button
                        type="button"
                        className="link-button cal-edit-btn"
                        onClick={() => {
                          setEditBill(b);
                          setOverrideForm({ amount: String(amt), note: "" });
                        }}
                      >
                        Edit this payment
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Edit payment override form */}
            {editBill && (
              <form className="cal-override-form" onSubmit={handleSaveOverride}>
                <p className="cal-override-label">
                  Editing: <strong>{editBill.name}</strong> on {selectedDay}
                </p>
                <label>
                  Amount
                  <input
                    type="number"
                    step="0.01"
                    value={overrideForm.amount}
                    onChange={(e) =>
                      setOverrideForm((p) => ({ ...p, amount: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Note (optional)
                  <input
                    type="text"
                    value={overrideForm.note}
                    onChange={(e) =>
                      setOverrideForm((p) => ({ ...p, note: e.target.value }))
                    }
                  />
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setEditBill(null)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="primary-button" disabled={overrideSaving}>
                    {overrideSaving ? "Saving..." : "Save this payment only"}
                  </button>
                </div>
              </form>
            )}

            {/* Expenses */}
            <div className="cal-detail-section">
              <h5>Expenses</h5>
              {dayExpenses.length === 0 ? (
                <p className="empty-row">No expenses.</p>
              ) : (
                dayExpenses.map((exp, i) => (
                  <div key={exp._id || i} className="cal-detail-row">
                    <span>
                      {exp.description || exp.category || "Expense"}
                    </span>
                    <span className="cal-detail-amt">{currency.format(exp.amount)}</span>
                  </div>
                ))
              )}
            </div>

            {/* Quick-add expense for this day */}
            <form className="cal-add-exp" onSubmit={handleAddDayExpense}>
              <h5>+ Add expense</h5>
              <div className="cal-add-row">
                <input
                  type="text"
                  placeholder="Description"
                  value={expForm.description}
                  onChange={(e) => setExpForm((p) => ({ ...p, description: e.target.value }))}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="$0.00"
                  value={expForm.amount}
                  onChange={(e) => setExpForm((p) => ({ ...p, amount: e.target.value }))}
                  required
                />
                <select
                  value={expForm.category}
                  onChange={(e) => setExpForm((p) => ({ ...p, category: e.target.value }))}
                >
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button type="submit" className="primary-button" disabled={expSaving}>
                  {expSaving ? "..." : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
