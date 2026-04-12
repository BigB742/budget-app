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
const { toLocalDate, clampDueDay } = require("./paycheckUtils");

// Snap a Date to midnight local time (strips HH:MM:SS).
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

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
  return total;
}

/**
 * Sum expenses whose `date` falls within [start, end]. Uses `date` as the
 * primary key — a future-dated expense belongs to its future period, NOT
 * to the period it was typed in. Legacy docs without a `date` field fall
 * back to `createdAt` so historical data still counts.
 */
async function sumExpensesInPeriod(userId, start, end) {
  const from = startOfDay(start);
  const to = endOfDay(end);
  const expenseDocs = await Expense.find({
    $and: [
      { $or: [{ user: userId }, { userId }] },
      {
        $or: [
          { date: { $gte: from, $lte: to } },
          { date: { $exists: false }, createdAt: { $gte: from, $lte: to } },
        ],
      },
    ],
  });
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

module.exports = {
  startOfDay,
  endOfDay,
  getEffectiveBillAmount,
  sumBillsInPeriod,
  sumExpensesInPeriod,
  sumOneTimeIncomeInPeriod,
  loadOverrideMap,
  loadBillPayments,
  computePeriodBalance,
};
