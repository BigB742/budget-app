// ─────────────────────────────────────────────────────────────────────────────
// PayPulse finance engine — single source of truth for pay-period balance math.
//
// Before this existed, `/paycheck-current` and `/projected-balance` each had
// their own inline implementation of "how much money is in a period". They
// produced the same answer after the last push, but via duplicated logic
// that was prone to drifting apart. Everything that computes a pay-period
// balance should now route through computePeriodBalance() in this file.
//
// The expense-bucketing rule is enforced here too: an expense belongs to the
// pay period that contains its `date` field, NEVER its `createdAt`. That
// makes future-dated expenses (e.g. a $150 transfer dated April 25 while
// today is April 12) affect the April 24 period's snapshot and NOT the
// current "You Can Spend" number.
// ─────────────────────────────────────────────────────────────────────────────

const Expense = require("../models/Expense");
const PaymentOverride = require("../models/PaymentOverride");
const BillPayment = require("../models/BillPayment");
const OneTimeIncome = require("../models/OneTimeIncome");
const Bill = require("../models/Bill");
const PaymentPlan = require("../models/PaymentPlan");
const { toLocalDate, clampDueDay, getPaydaysInRange } = require("./paycheckUtils");
const { startOfDayInAppTz } = require("./appTz");

// All date-snapping in this file routes through utils/appTz so PayPulse's
// "today" is always interpreted in America/Los_Angeles, regardless of
// where the server runs (Vercel = UTC). The local startOfDay alias
// preserves existing call sites in sumBillsInPeriod, sumExpensesInPeriod,
// loadOverrideMap, loadBillPayments, and sumOneTimeIncomeInPeriod —
// they all pass through Dates whose server-local y/m/d already encode
// LA y/m/d (callers feed them values derived from resolveToday + the
// LA-pinned getCurrentPayPeriod chain), so re-projecting through Intl
// is a no-op for safety. New code (computeSpendable, sumPaychecksInRange)
// calls startOfDayInAppTz directly for explicitness.
const startOfDay = startOfDayInAppTz;

// End-of-day (23:59:59.999) for inclusive range queries.
function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/**
 * Determine the effective amount for a bill on a specific date. Honors
 * one-shot payment overrides, the lastPaymentDate/lastPaymentAmount final
 * payment rule, and bill start/end dates. Returns null if the bill should
 * be excluded entirely on that date.
 */
function getEffectiveBillAmount(bill, dateLocal, overrideMap) {
  const billStart = bill.startDate ? startOfDay(toLocalDate(bill.startDate)) : null;
  if (billStart && dateLocal < billStart) return null;

  const lastPay = bill.lastPaymentDate ? startOfDay(toLocalDate(bill.lastPaymentDate)) : null;
  if (lastPay && dateLocal > lastPay) return null;

  const key = `${bill._id}_${dateLocal.getFullYear()}-${String(dateLocal.getMonth() + 1).padStart(2, "0")}-${String(dateLocal.getDate()).padStart(2, "0")}`;
  if (overrideMap && overrideMap.has(key)) return overrideMap.get(key);

  if (
    lastPay &&
    dateLocal.getMonth() === lastPay.getMonth() &&
    dateLocal.getDate() === lastPay.getDate() &&
    dateLocal.getFullYear() === lastPay.getFullYear() &&
    bill.lastPaymentAmount != null
  ) {
    return Number(bill.lastPaymentAmount);
  }

  return Number(bill.amount) || 0;
}

/**
 * Sum bills whose effective due date falls within [start, end]. Respects
 * payment overrides, the final-payment rule, and BillPayment records (a
 * paid bill counts under its paidDate period, not its dueDate period, so
 * a bill paid early shifts to the period it was actually paid in).
 */
function sumBillsInPeriod(bills, start, end, overrideMap = new Map(), billPayments = []) {
  const pStart = startOfDay(start);
  const pEnd = startOfDay(end);

  const paymentMap = new Map();
  billPayments.forEach((bp) => {
    const dueLocal = startOfDay(toLocalDate(bp.dueDate));
    const key = `${bp.bill}_${dueLocal.getFullYear()}-${String(dueLocal.getMonth() + 1).padStart(2, "0")}-${String(dueLocal.getDate()).padStart(2, "0")}`;
    paymentMap.set(key, bp);
  });

  let total = 0;
  bills.forEach((bill) => {
    const dueDates = [];
    const clampedStart = clampDueDay(bill.dueDayOfMonth, pStart.getFullYear(), pStart.getMonth());
    dueDates.push(new Date(pStart.getFullYear(), pStart.getMonth(), clampedStart));
    if (pStart.getMonth() !== pEnd.getMonth() || pStart.getFullYear() !== pEnd.getFullYear()) {
      const clampedEnd = clampDueDay(bill.dueDayOfMonth, pEnd.getFullYear(), pEnd.getMonth());
      dueDates.push(new Date(pEnd.getFullYear(), pEnd.getMonth(), clampedEnd));
    }
    const uniqueTimes = new Set(dueDates.map((d) => d.getTime()));
    uniqueTimes.forEach((time) => {
      const d = new Date(time);
      if (d >= pStart && d <= pEnd) {
        const paymentKey = `${bill._id}_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const payment = paymentMap.get(paymentKey);
        if (payment) {
          const paidDateLocal = startOfDay(toLocalDate(payment.paidDate));
          if (paidDateLocal >= pStart && paidDateLocal <= pEnd) {
            total += Number(payment.paidAmount) || 0;
          }
        } else {
          const amt = getEffectiveBillAmount(bill, d, overrideMap);
          if (amt != null) total += amt;
        }
      }
    });
  });

  // Paid-early cross-period loop. The main loop iterates by each bill's
  // scheduled due day inside [pStart, pEnd] — which means a bill paid
  // early from a FUTURE period into this one (dueDate after pEnd,
  // paidDate inside [pStart, pEnd]) is never examined above. Previously
  // the paid-early money was tracked via an auto-generated Expense
  // (category "Bills", autoGenerated:true) created by
  // utils/billPaymentService.js. After the sumExpensesInPeriod filter
  // excludes autoGenerated expenses (so "Expenses this period" stays
  // user-logged only), the paid-early outflow has to be counted here
  // instead — otherwise it disappears from the period math and the
  // spendable balance drifts upward by that amount.
  billPayments.forEach((bp) => {
    if (bp.paidDate == null) return;
    const paidDateLocal = startOfDay(toLocalDate(bp.paidDate));
    if (paidDateLocal < pStart || paidDateLocal > pEnd) return;
    const dueLocal = startOfDay(toLocalDate(bp.dueDate));
    // Dues inside this period are already handled by the main loop's
    // payment-matched branch. Only bills whose dueDate falls OUTSIDE
    // this period need to be added here.
    if (dueLocal >= pStart && dueLocal <= pEnd) return;
    total += Number(bp.paidAmount) || 0;
  });

  return total;
}

/**
 * Sum expenses whose `date` falls within [start, end]. Uses `date` as the
 * primary key — a future-dated expense belongs to its future period, NOT
 * to the period it was typed in. Legacy docs without a `date` field fall
 * back to `createdAt` so historical data still counts.
 *
 * IMPORTANT: Savings deposits are stored as Expense docs with
 * `category: "Savings"` because the Savings flow reuses the Expense
 * collection. Those are transfers to the user's own savings goals, not
 * spending. We ALWAYS exclude them from spent totals. A Savings
 * withdrawal is recorded as a one-time income row elsewhere — not here.
 */
async function sumExpensesInPeriod(userId, start, end, opts = {}) {
  const from = startOfDay(start);
  const to = endOfDay(end);
  const filters = [
    { $or: [{ user: userId }, { userId }] },
    // Case-insensitive: legacy rows with "savings"/"SAVINGS" casing
    // are still transfers, not spending, and must not count here.
    { category: { $not: /^savings$/i } },
    // Auto-generated "paid early" bill expenses (created by
    // utils/billPaymentService.js when a bill's paidDate falls in a
    // different period than its dueDate) represent bills, not
    // user-logged expenses. They're counted via sumBillsInPeriod's
    // paid-early loop instead, so excluding them here keeps the
    // "Expenses this period" surface clean (user spending only)
    // without losing the outflow from the balance math.
    { autoGenerated: { $ne: true } },
    {
      $or: [
        { date: { $gte: from, $lte: to } },
        { date: { $exists: false }, createdAt: { $gte: from, $lte: to } },
      ],
    },
  ];
  // Optional: exclude rows flagged accountedFor:true. Used by
  // computeSpendable so an expense the user marked "already in
  // onboarding balance" is skipped on both sides of the formula.
  // computePeriodBalance does NOT pass this flag, so its callers
  // (period-history, year-to-date) see byte-identical behavior.
  if (opts.excludeAccountedFor) {
    filters.push({ accountedFor: { $ne: true } });
  }
  const expenseDocs = await Expense.find({ $and: filters });
  return expenseDocs.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
}

/** Load payment-override map for [start, end]. */
async function loadOverrideMap(userId, start, end) {
  const from = startOfDay(start);
  const to = endOfDay(end);
  const docs = await PaymentOverride.find({ user: userId, date: { $gte: from, $lte: to } });
  const map = new Map();
  docs.forEach((d) => {
    const local = startOfDay(toLocalDate(d.date));
    const key = `${d.bill}_${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    map.set(key, Number(d.amount) || 0);
  });
  return map;
}

/** Load BillPayment records relevant to [start, end]. */
async function loadBillPayments(userId, start, end) {
  const from = startOfDay(start);
  const to = endOfDay(end);
  return BillPayment.find({
    user: userId,
    $or: [{ dueDate: { $gte: from, $lte: to } }, { paidDate: { $gte: from, $lte: to } }],
  });
}

/**
 * Sum one-time income whose `date` falls within [start, end].
 */
async function sumOneTimeIncomeInPeriod(userId, start, end) {
  const from = startOfDay(start);
  const to = endOfDay(end);
  const docs = await OneTimeIncome.find({ user: userId, date: { $gte: from, $lte: to } });
  return docs.reduce((s, i) => s + (Number(i.amount) || 0), 0);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * computePeriodBalance — THE canonical balance calculation for one pay period.
 *
 * This is the single function every endpoint should call when it wants to
 * know "what does this pay period look like". It handles three distinct
 * call shapes via the windowStart parameter:
 *
 *   1. DASHBOARD "current period" math:
 *        startingBalance  = user.currentBalance (onboarding source of truth)
 *        windowStart      = today (ignore past activity — already in balance)
 *        recurringIncome  = 0 (any paycheck for this period already landed)
 *        → estimatedEnd = "You Can Spend"
 *
 *   2. PROJECTED-BALANCE chain, iteration 0 (current period in the chain):
 *        Same shape as dashboard — seeded with currentBalance, windowStart=today.
 *
 *   3. PROJECTED-BALANCE chain, iteration 1+ (future periods):
 *        startingBalance  = previous period's estimatedEnd (the rollover)
 *        windowStart      = periodStart (sum the whole period)
 *        recurringIncome  = this period's scheduled paycheck
 *        → estimatedEnd = rollover + paycheck + oneTimeIncome - bills - expenses
 *
 * The ONLY field that changes interpretation across call shapes is
 * `recurringIncome` — the caller decides whether to add the period's
 * paycheck or treat it as already-deposited.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {Date}   params.periodStart — the full pay period start
 * @param {Date}   params.periodEnd — the full pay period end
 * @param {number} params.startingBalance — balance going INTO the period
 * @param {number} [params.recurringIncome=0] — recurring paycheck for this period
 * @param {Array}  params.bills — prefetched user bills
 * @param {Map}    [params.overrideMap] — prefetched payment overrides
 * @param {Array}  [params.payments] — prefetched bill payments
 * @param {Date}   [params.windowStart] — optional narrowed start (defaults to periodStart)
 *
 * @returns {Promise<{
 *   startingBalance: number,
 *   periodStart: Date,
 *   periodEnd: Date,
 *   windowStart: Date,
 *   windowEnd: Date,
 *   totalBills: number,
 *   totalExpenses: number,
 *   recurringIncome: number,
 *   oneTimeIncome: number,
 *   totalIncome: number,
 *   estimatedEnd: number,
 *   spendable: number,
 * }>}
 * ═══════════════════════════════════════════════════════════════════════════
 */
async function computePeriodBalance(params) {
  const {
    userId,
    periodStart,
    periodEnd,
    startingBalance = 0,
    recurringIncome = 0,
    bills = [],
    overrideMap = new Map(),
    payments = [],
    windowStart: windowStartInput,
  } = params;

  const windowStart = windowStartInput || periodStart;
  const windowEnd = periodEnd;

  const totalBills = sumBillsInPeriod(bills, windowStart, windowEnd, overrideMap, payments);
  const totalExpenses = await sumExpensesInPeriod(userId, windowStart, windowEnd);
  const oneTimeIncome = await sumOneTimeIncomeInPeriod(userId, windowStart, windowEnd);

  const startBal = Number(startingBalance) || 0;
  const recurring = Number(recurringIncome) || 0;
  const totalIncome = recurring + oneTimeIncome;
  const estimatedEnd = startBal + totalIncome - totalBills - totalExpenses;

  return {
    startingBalance: startBal,
    periodStart,
    periodEnd,
    windowStart,
    windowEnd,
    totalBills,
    totalExpenses,
    recurringIncome: recurring,
    oneTimeIncome,
    totalIncome,
    estimatedEnd,
    spendable: estimatedEnd, // alias — same value, different naming for clarity at call sites
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * sumPaychecksInRange — pure helper, no DB.
 *
 * Sums recurring paycheck income across [start, end] for an array of
 * IncomeSource docs. Each source contributes count(paydays in range) ×
 * source.amount. The pre-anchor clamp inside getPaydaysInRange already
 * guarantees no false-positive paydays before each source's nextPayDate
 * anchor — i.e., a user who onboards 2026-04-25 with anchor 2026-05-08
 * sees zero paychecks for the synthetic pre-anchor [4/25, 5/7] window.
 * Inactive sources, missing amounts, missing anchors, or missing
 * frequencies are skipped silently.
 * ═══════════════════════════════════════════════════════════════════════════
 */
function sumPaychecksInRange(sources, start, end) {
  if (!Array.isArray(sources) || !sources.length) return 0;
  const from = startOfDayInAppTz(start);
  const to = startOfDayInAppTz(end);
  if (!from || !to) return 0;
  if (to < from) return 0;
  let total = 0;
  for (const src of sources) {
    if (!src || src.isActive === false) continue;
    const amt = Number(src.amount);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    if (!src.nextPayDate || !src.frequency) continue;
    const paydays = getPaydaysInRange(src.nextPayDate, src.frequency, from, to);
    total += paydays.length * amt;
  }
  return total;
}

/**
 * Enumerate { year, month } pairs covering every calendar month touched
 * by [start, end]. Used by computeSpendable to walk recurring bill
 * occurrences month-by-month across the cumulative window.
 */
function monthRangeYM(start, end) {
  const out = [];
  let y = start.getFullYear();
  let m = start.getMonth();
  const ey = end.getFullYear();
  const em = end.getMonth();
  while (y < ey || (y === ey && m <= em)) {
    out.push({ year: y, month: m });
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return out;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * computeSpendable — cumulative-from-onboarding "You can spend" calculation.
 *
 * Sums every dollar in and out of the user's books across
 * [onboardingDate, asOfDate] inclusive, returning the spendable balance
 * plus a component breakdown for downstream display. Replaces the
 * period-scoped formula in /paycheck-current and /projected-balance
 * (wired up in commits 6 and 7 — this commit only adds the function).
 *
 * Formula:
 *   spendable = currentBalance
 *             + incomeRecurring             (paydays in range × source.amount)
 *             + incomeOneTime               (OneTimeIncome dated in range)
 *             − expenses                    (Expense.date in range, excluding
 *                                            savings + autoGenerated + accountedFor)
 *             − unpaidBills                 (bill occurrences in range with no
 *                                            BillPayment, accountedFor !== true)
 *             − unpaidPlans                 (plan installments scheduled in range,
 *                                            paid:false, accountedFor !== true)
 *             − paidBills                   (BillPayment.paidDate in range,
 *                                            accountedFor !== true on both sides)
 *             − paidPlans                   (plan installments paid:true with
 *                                            paidDate in range, accountedFor !== true)
 *
 * currentBalance is the onboarding seed mutated only by savings transactions —
 * see docs/financial-logic-specification.md for the contract.
 *
 * Degenerate cases (return spendable=currentBalance, all components 0):
 *   - onboardingDate is null/undefined
 *   - asOfDate is invalid
 *   - asOfDate < onboardingDate
 *
 * computePeriodBalance is left untouched — period-history and year-to-date
 * still call it and need their existing behavior.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {Date}   params.asOfDate — right edge of the cumulative window
 * @param {Array}  params.sources — pre-loaded IncomeSource docs
 * @param {number} params.currentBalance — User.currentBalance (onboarding seed ± savings)
 * @param {Date}   params.onboardingDate — User.onboardingDate, the anchor
 * @param {Array}  [params.bills] — optional pre-loaded Bill docs (else loaded here)
 * @param {Map}    [params.overrideMap] — optional pre-loaded override map
 * @returns {Promise<{ spendable: number, components: object, range: { start: Date, end: Date } }>}
 * ═══════════════════════════════════════════════════════════════════════════
 */
async function computeSpendable({
  userId,
  asOfDate,
  sources,
  currentBalance,
  onboardingDate,
  bills,
  overrideMap,
}) {
  const cb = Number(currentBalance) || 0;
  const emptyComponents = {
    currentBalance: cb,
    incomeRecurring: 0,
    incomeOneTime: 0,
    expenses: 0,
    unpaidBills: 0,
    unpaidPlans: 0,
    paidBills: 0,
    paidPlans: 0,
  };

  // Degenerate: missing anchor → return seed only.
  if (!onboardingDate) {
    return {
      spendable: cb,
      components: emptyComponents,
      range: { start: asOfDate, end: asOfDate },
    };
  }

  const start = startOfDayInAppTz(onboardingDate);
  const end = startOfDayInAppTz(asOfDate);
  if (!start || !end) {
    return {
      spendable: cb,
      components: emptyComponents,
      range: { start: asOfDate, end: asOfDate },
    };
  }
  if (end < start) {
    return {
      spendable: cb,
      components: emptyComponents,
      range: { start, end },
    };
  }

  // ── Income ────────────────────────────────────────────────────────
  const incomeRecurring = sumPaychecksInRange(sources || [], start, end);
  const incomeOneTime = await sumOneTimeIncomeInPeriod(userId, start, end);

  // ── Expenses (user-logged only) ───────────────────────────────────
  const expenses = await sumExpensesInPeriod(userId, start, end, {
    excludeAccountedFor: true,
  });

  // ── Bills ─────────────────────────────────────────────────────────
  const billDocs = Array.isArray(bills)
    ? bills
    : await Bill.find({ user: userId, isActive: { $ne: false } });
  const overrides = overrideMap || (await loadOverrideMap(userId, start, end));
  const billPayments = await loadBillPayments(userId, start, end);

  // (bill_id, due-YMD) → BillPayment for fast occurrence lookup.
  const paymentByOccurrence = new Map();
  billPayments.forEach((bp) => {
    if (!bp.dueDate) return;
    const dueLocal = startOfDay(toLocalDate(bp.dueDate));
    const key = `${bp.bill}_${dueLocal.getFullYear()}-${String(dueLocal.getMonth() + 1).padStart(2, "0")}-${String(dueLocal.getDate()).padStart(2, "0")}`;
    paymentByOccurrence.set(key, bp);
  });

  // Bills flagged accountedFor:true — their BillPayments are also
  // skipped on the paid side regardless of the payment row's own flag.
  const accountedForBillIds = new Set(
    billDocs.filter((b) => b.accountedFor === true).map((b) => String(b._id)),
  );

  let unpaidBills = 0;
  // Defensive legacy-flag path: bill.paid===true with NO BillPayment for
  // any in-range occurrence. Count only the most-recent occurrence as
  // paid; earlier orphans count as unpaid. Accumulated here, summed
  // into paidBills below.
  let legacyPaidBillsTotal = 0;

  for (const bill of billDocs) {
    if (bill.accountedFor === true) continue;
    const dueDay = bill.dueDayOfMonth;
    if (!dueDay) continue;

    // Enumerate every occurrence within [start, end] (one per calendar
    // month, clamped to month length so dueDayOfMonth=31 → Feb 28/29).
    const occurrences = [];
    for (const { year, month } of monthRangeYM(start, end)) {
      const day = clampDueDay(dueDay, year, month);
      const occ = new Date(year, month, day);
      if (occ >= start && occ <= end) occurrences.push(occ);
    }
    occurrences.sort((a, b) => a.getTime() - b.getTime());

    // Walk in order; orphans are occurrences without a BillPayment row.
    const orphans = [];
    for (const occ of occurrences) {
      const key = `${bill._id}_${occ.getFullYear()}-${String(occ.getMonth() + 1).padStart(2, "0")}-${String(occ.getDate()).padStart(2, "0")}`;
      const payment = paymentByOccurrence.get(key);
      if (payment) {
        // Has a BillPayment. Either way (accountedFor or not), this
        // occurrence is NOT in unpaidBills. accountedFor:false ones land
        // in paidBills via the standalone BillPayment query below.
        continue;
      }
      orphans.push(occ);
    }

    if (!orphans.length) continue;

    if (bill.paid === true) {
      // Most recent orphan → paidBills (legacy bucket). Earlier orphans
      // → unpaidBills.
      const last = orphans[orphans.length - 1];
      const earlier = orphans.slice(0, -1);
      const lastAmt = getEffectiveBillAmount(bill, last, overrides);
      if (lastAmt != null) legacyPaidBillsTotal += lastAmt;
      for (const o of earlier) {
        const amt = getEffectiveBillAmount(bill, o, overrides);
        if (amt != null) unpaidBills += amt;
      }
    } else {
      for (const o of orphans) {
        const amt = getEffectiveBillAmount(bill, o, overrides);
        if (amt != null) unpaidBills += amt;
      }
    }
  }

  let paidBills = 0;
  billPayments.forEach((bp) => {
    if (bp.accountedFor === true) return;
    if (accountedForBillIds.has(String(bp.bill))) return;
    if (!bp.paidDate) return;
    const paidLocal = startOfDay(toLocalDate(bp.paidDate));
    if (paidLocal < start || paidLocal > end) return;
    paidBills += Number(bp.paidAmount) || 0;
  });
  paidBills += legacyPaidBillsTotal;

  // ── Plans ─────────────────────────────────────────────────────────
  // Plan-installment date reads mirror the bill-side pattern: pass the
  // raw stored field through `toLocalDate` (recovers UTC-midnight Mongo
  // date-only values into server-local y/m/d) and then through
  // `startOfDayInAppTz` (snaps wall-clock instants to the LA calendar
  // day). Commit 4 used `new Date(...)` directly here, which offset
  // matching by one day for UTC-stored fields on PT-aware reads — this
  // commit unifies the pattern with bills.
  const planDocs = await PaymentPlan.find({ userId });
  let unpaidPlans = 0;
  let paidPlans = 0;
  planDocs.forEach((plan) => {
    (plan.payments || []).forEach((p) => {
      if (p.accountedFor === true) return;
      if (p.paid === true) {
        const dp = p.paidDate || p.datePaid;
        if (!dp) return;
        const dpLocal = startOfDayInAppTz(toLocalDate(dp));
        if (!dpLocal) return;
        if (dpLocal < start || dpLocal > end) return;
        paidPlans += Number(p.amount) || 0;
      } else {
        if (!p.date) return;
        const dLocal = startOfDayInAppTz(toLocalDate(p.date));
        if (!dLocal) return;
        if (dLocal < start || dLocal > end) return;
        unpaidPlans += Number(p.amount) || 0;
      }
    });
  });

  const spendable =
    cb +
    incomeRecurring +
    incomeOneTime -
    expenses -
    unpaidBills -
    unpaidPlans -
    paidBills -
    paidPlans;

  return {
    spendable,
    components: {
      currentBalance: cb,
      incomeRecurring,
      incomeOneTime,
      expenses,
      unpaidBills,
      unpaidPlans,
      paidBills,
      paidPlans,
    },
    range: { start, end },
  };
}

module.exports = {
  startOfDay,
  endOfDay,
  getEffectiveBillAmount,
  sumBillsInPeriod,
  sumExpensesInPeriod,
  sumOneTimeIncomeInPeriod,
  sumPaychecksInRange,
  loadOverrideMap,
  loadBillPayments,
  computePeriodBalance,
  computeSpendable,
};
