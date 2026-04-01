import { useCallback, useEffect, useMemo, useState } from "react";
import { authFetch } from "../apiClient";
import { useIncomeSources } from "../hooks/useIncomeSources";
import AdSlot from "../components/AdSlot";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// TODO: Replace with real subscription check when paywall is built
const isPremium = () => true;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CATEGORY_OPTIONS = [
  "Dining Out", "Entertainment", "Food", "Gas", "Groceries",
  "Gym", "Health", "Home", "Shopping", "Subscriptions", "Travel", "Other",
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
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }
  return weeks;
};

const Calendar = () => {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [bills, setBills] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [billPayments, setBillPayments] = useState([]);
  const [oneTimeIncomes, setOneTimeIncomes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // Day-detail state
  const [expForm, setExpForm] = useState({ description: "", amount: "", category: "Food" });
  const [expSaving, setExpSaving] = useState(false);
  const [editBill, setEditBill] = useState(null);
  const [overrideForm, setOverrideForm] = useState({ amount: "", note: "" });
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(null);
  const [paidForm, setPaidForm] = useState({ paidDate: "", note: "" });
  const [paidSaving, setPaidSaving] = useState(false);
  const [incForm, setIncForm] = useState({ name: "", amount: "" });
  const [incSaving, setIncSaving] = useState(false);

  const { sources } = useIncomeSources();

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const goNext = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); } else { setViewMonth((m) => m + 1); } };
  const goPrev = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); } else { setViewMonth((m) => m - 1); } };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const from = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
      const to = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const [b, e, o, bp, oti] = await Promise.all([
        authFetch("/api/bills"),
        authFetch(`/api/expenses?from=${from}&to=${to}`),
        authFetch(`/api/payment-overrides?from=${from}&to=${to}`),
        authFetch(`/api/bill-payments?from=${from}&to=${to}`).catch(() => []),
        authFetch(`/api/one-time-income?from=${from}&to=${to}`).catch(() => []),
      ]);
      setBills(Array.isArray(b) ? b : []);
      setExpenses(Array.isArray(e) ? e : []);
      setOverrides(Array.isArray(o) ? o : []);
      setBillPayments(Array.isArray(bp) ? bp : []);
      setOneTimeIncomes(Array.isArray(oti) ? oti : []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [viewYear, viewMonth]);

  useEffect(() => { loadData(); }, [loadData]);

  // Compute paydays
  const paydaySet = useMemo(() => {
    const set = new Set();
    (sources || []).forEach((src) => {
      if (!src.nextPayDate || !src.frequency) return;
      const raw = new Date(src.nextPayDate);
      const anchor = new Date(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate());
      const step = src.frequency === "weekly" ? 7 : src.frequency === "biweekly" ? 14 : 0;
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
        set.add(toKey(viewYear, viewMonth, anchor.getDate()));
      }
    });
    return set;
  }, [sources, viewYear, viewMonth]);

  // Lookup maps
  const billsByDay = useMemo(() => {
    const map = {};
    bills.forEach((b) => {
      const day = b.dueDayOfMonth || b.dueDay;
      if (!day) return;
      if (b.lastPaymentDate) {
        const lp = new Date(b.lastPaymentDate);
        const lpLocal = new Date(lp.getUTCFullYear(), lp.getUTCMonth(), lp.getUTCDate());
        if (new Date(viewYear, viewMonth, day) > lpLocal) return;
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
  const getBillPayment = (billId, dateKey) => paidMap[`${billId}_${dateKey}`];

  const weeks = buildMonthGrid(viewYear, viewMonth);

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
  const locked = isFutureMonth && !isPremium();

  // Load paycheck snapshot when clicking a payday
  const loadSnapshot = useCallback(async (dateKey) => {
    setSnapshotLoading(true);
    setSnapshot(null);
    try {
      const data = await authFetch(`/api/summary/projected-balance?paydayDate=${dateKey}`);
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
      setMarkingPaid(null);
      setPaidForm({ paidDate: "", note: "" });
      loadData();
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
    } catch { /* ignore */ }
    finally { setIncSaving(false); }
  };

  const dayBills = selectedDay ? billsByDay[selectedDay] || [] : [];
  const dayExpenses = selectedDay ? expensesByDay[selectedDay] || [] : [];
  const dayIncomes = selectedDay ? incomeByDay[selectedDay] || [] : [];
  const isSelectedPayday = selectedDay ? paydaySet.has(selectedDay) : false;

  return (
    <div className="calendar-page">
      <div className="cal-header">
        <button type="button" className="cal-nav-btn" onClick={goPrev}>&larr;</button>
        <h2 className="cal-month-label">{monthLabel}</h2>
        <button type="button" className="cal-nav-btn" onClick={goNext}>&rarr;</button>
      </div>

      {!isPremium() && isFutureMonth && (
        <div className="cal-toolbar"><span className="premium-badge">Premium required for future months</span></div>
      )}

      {loading && <p className="status">Loading...</p>}

      {locked ? (
        <div className="premium-lock">
          <p>Projected months are a premium feature.</p>
          <button type="button" className="primary-button">Upgrade to Premium</button>
        </div>
      ) : (
        <div className="cal-grid-wrapper">
          <div className="cal-weekdays">
            {WEEKDAYS.map((d) => (<div key={d} className="cal-weekday">{d}</div>))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="cal-week">
              {week.map((day, di) => {
                if (day === null) return <div key={di} className="cal-cell empty" />;
                const key = toKey(viewYear, viewMonth, day);
                const db = billsByDay[key] || [];
                const de = expensesByDay[key] || [];
                const isPayday = paydaySet.has(key);
                const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                const billTotal = db.reduce((s, b) => s + getEffectiveAmount(b, key), 0);
                const expTotal = de.reduce((s, x) => s + Number(x.amount || 0), 0);

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
                      return paid
                        ? <span key={b._id} className="cal-paid-tag">&#x2713; Paid</span>
                        : <span key={b._id} className="cal-bill-tag"><span className="cal-bill-dot" />{currency.format(getEffectiveAmount(b, key))}</span>;
                    })}
                    {expTotal > 0 && (
                      <span className="cal-exp-tag"><span className="cal-exp-dot" />{currency.format(expTotal)}</span>
                    )}
                    {(incomeByDay[key] || []).length > 0 && (
                      <span className="cal-income-tag"><span className="cal-income-dot" />+{currency.format((incomeByDay[key] || []).reduce((s, i) => s + Number(i.amount || 0), 0))}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <AdSlot placement="banner" />

      {/* Day detail modal */}
      {selectedDay && (
        <div className="modal-overlay" onClick={() => setSelectedDay(null)}>
          <div className="modal-card cal-detail" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>{new Date(selectedDay + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</h4>
              <button type="button" className="ghost-button" onClick={() => setSelectedDay(null)}>&#x2715;</button>
            </div>

            {/* Paycheck snapshot */}
            {isSelectedPayday && (
              <div className="paycheck-snapshot">
                <h5>Paycheck Snapshot</h5>
                {snapshotLoading ? (
                  <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)" }}>Calculating projection...</p>
                ) : snapshot ? (
                  <>
                    <div className="snapshot-row"><span>Paycheck amount</span><span>{currency.format(snapshot.paycheckAmount || 0)}</span></div>
                    <div className="snapshot-row"><span>Rollover from previous</span><span>{currency.format(snapshot.rollover || 0)}</span></div>
                    <div className="snapshot-row"><span>Total available</span><span className="positive">{currency.format(snapshot.totalAvailable || 0)}</span></div>
                    <div className="snapshot-row"><span>Bills this period</span><span className="negative">&minus;{currency.format(snapshot.billsThisPeriod || 0)}</span></div>
                    <div className="snapshot-row"><span>Expenses this period</span><span className="negative">&minus;{currency.format(snapshot.expensesThisPeriod || 0)}</span></div>
                    <div className="snapshot-row total"><span>Estimated balance</span><span className={snapshot.estimatedBalance >= 0 ? "positive" : "negative"}>{currency.format(snapshot.estimatedBalance || 0)}</span></div>
                  </>
                ) : (
                  <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)" }}>Unable to load projection.</p>
                )}
              </div>
            )}

            {/* Bills */}
            {dayBills.length > 0 && (
              <div className="cal-detail-section">
                <h5>Bills</h5>
                {dayBills.map((b) => {
                  const amt = getEffectiveAmount(b, selectedDay);
                  const payment = getBillPayment(b._id, selectedDay);
                  const hasOverride = !!overrideMap[`${b._id}_${selectedDay}`];
                  return (
                    <div key={b._id} className="cal-detail-row bill-row">
                      <div>
                        <strong>{b.name}</strong>
                        {payment ? (
                          <span className="cal-paid-badge">&#x2713; Paid {new Date(payment.paidDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        ) : (
                          <span className="cal-detail-amt bill-amt">{currency.format(amt)}</span>
                        )}
                        {hasOverride && <span className="pill">Edited</span>}
                      </div>
                      {!payment && (
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button type="button" className="link-button cal-edit-btn" onClick={() => { setEditBill(b); setOverrideForm({ amount: String(amt), note: "" }); }}>Edit</button>
                          <button type="button" className="link-button" style={{ fontSize: "0.72rem", color: "var(--teal)" }} onClick={() => { setMarkingPaid(b); setPaidForm({ paidDate: todayKey(), note: "" }); }}>Mark as paid</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Mark as paid form */}
            {markingPaid && (
              <form className="cal-override-form" onSubmit={handleMarkPaid}>
                <p className="cal-override-label">Mark <strong>{markingPaid.name}</strong> as paid</p>
                <label>When did you pay it?<input type="date" value={paidForm.paidDate} onChange={(e) => setPaidForm((p) => ({ ...p, paidDate: e.target.value }))} required /></label>
                <label>Note (optional)<input type="text" value={paidForm.note} onChange={(e) => setPaidForm((p) => ({ ...p, note: e.target.value }))} /></label>
                <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setMarkingPaid(null)}>Cancel</button><button type="submit" className="primary-button" disabled={paidSaving}>{paidSaving ? "..." : "Save"}</button></div>
              </form>
            )}

            {editBill && (
              <form className="cal-override-form" onSubmit={handleSaveOverride}>
                <p className="cal-override-label">Editing: <strong>{editBill.name}</strong> on {selectedDay}</p>
                <label>Amount<input type="number" step="0.01" value={overrideForm.amount} onChange={(e) => setOverrideForm((p) => ({ ...p, amount: e.target.value }))} required /></label>
                <label>Note (optional)<input type="text" value={overrideForm.note} onChange={(e) => setOverrideForm((p) => ({ ...p, note: e.target.value }))} /></label>
                <div className="modal-actions">
                  <button type="button" className="ghost-button" onClick={() => setEditBill(null)}>Cancel</button>
                  <button type="submit" className="primary-button" disabled={overrideSaving}>{overrideSaving ? "Saving..." : "Save this payment only"}</button>
                </div>
              </form>
            )}

            <div className="cal-detail-section">
              <h5>Expenses</h5>
              {dayExpenses.length === 0 ? (
                <p className="empty-row">No expenses.</p>
              ) : dayExpenses.map((exp, i) => (
                <div key={exp._id || i} className="cal-detail-row">
                  <span>{exp.description || exp.category || "Expense"}</span>
                  <span className="cal-detail-amt">{currency.format(exp.amount)}</span>
                </div>
              ))}
            </div>

            {/* One-time income */}
            {dayIncomes.length > 0 && (
              <div className="cal-detail-section">
                <h5>Income</h5>
                {dayIncomes.map((inc) => (
                  <div key={inc._id} className="cal-detail-row">
                    <span style={{ color: "#8B5CF6", fontWeight: 600 }}>{inc.name}</span>
                    <span className="cal-detail-amt" style={{ color: "#8B5CF6" }}>+{currency.format(inc.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Add income form */}
            <form className="cal-add-exp" onSubmit={handleAddIncome} style={{ borderTop: dayIncomes.length > 0 ? "none" : undefined }}>
              <h5>+ Add income</h5>
              <div className="cal-add-row">
                <input type="text" placeholder="Source" value={incForm.name} onChange={(e) => setIncForm((p) => ({ ...p, name: e.target.value }))} required />
                <input type="number" step="0.01" min="0.01" placeholder="$0.00" value={incForm.amount} onChange={(e) => setIncForm((p) => ({ ...p, amount: e.target.value }))} required />
                <button type="submit" className="primary-button" disabled={incSaving}>{incSaving ? "..." : "Add"}</button>
              </div>
            </form>

            <form className="cal-add-exp" onSubmit={handleAddDayExpense}>
              <h5>+ Add expense</h5>
              <div className="cal-add-row">
                <input type="text" placeholder="Description" value={expForm.description} onChange={(e) => setExpForm((p) => ({ ...p, description: e.target.value }))} />
                <input type="number" step="0.01" min="0.01" placeholder="$0.00" value={expForm.amount} onChange={(e) => setExpForm((p) => ({ ...p, amount: e.target.value }))} required />
                <select value={expForm.category} onChange={(e) => setExpForm((p) => ({ ...p, category: e.target.value }))}>
                  {CATEGORY_OPTIONS.map((c) => (<option key={c} value={c}>{c}</option>))}
                </select>
                <button type="submit" className="primary-button" disabled={expSaving}>{expSaving ? "..." : "Add"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
