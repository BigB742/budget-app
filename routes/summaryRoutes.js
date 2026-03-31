const express = require("express");

const { authRequired } = require("../middleware/auth");
const IncomeSource = require("../models/IncomeSource");
const Bill = require("../models/Bill");
const Expense = require("../models/Expense");
const SavingsGoal = require("../models/SavingsGoal");
const Investment = require("../models/Investment");
const PaymentOverride = require("../models/PaymentOverride");
const { getBudgetPeriod, getPeriodsForSources, toLocalDate } = require("../utils/paycheckUtils");

const router = express.Router();

// Strip time component — return midnight local for a given Date
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Determine the effective amount for a bill on a specific date.
 * Checks: (1) payment overrides, (2) lastPaymentDate/lastPaymentAmount, (3) regular amount.
 * Returns null if the bill should be excluded (past its lastPaymentDate).
 */
function getEffectiveBillAmount(bill, dateLocal, overrideMap) {
  const lastPay = bill.lastPaymentDate ? startOfDay(toLocalDate(bill.lastPaymentDate)) : null;

  // If we're past the lastPaymentDate, skip this bill entirely
  if (lastPay && dateLocal > lastPay) return null;

  // Check for a one-time payment override
  const key = `${bill._id}_${dateLocal.getFullYear()}-${String(dateLocal.getMonth() + 1).padStart(2, "0")}-${String(dateLocal.getDate()).padStart(2, "0")}`;
  if (overrideMap.has(key)) return overrideMap.get(key);

  // If this is the last payment date month/day, use lastPaymentAmount
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

// Helper: sum bills that fall within a date range, respecting overrides and lastPayment rules
function sumBillsInPeriod(bills, start, end, overrideMap = new Map()) {
  const pStart = startOfDay(start);
  const pEnd = startOfDay(end);

  let total = 0;
  bills.forEach((bill) => {
    const dueDates = [];
    dueDates.push(new Date(pStart.getFullYear(), pStart.getMonth(), bill.dueDayOfMonth));
    if (pStart.getMonth() !== pEnd.getMonth() || pStart.getFullYear() !== pEnd.getFullYear()) {
      dueDates.push(new Date(pEnd.getFullYear(), pEnd.getMonth(), bill.dueDayOfMonth));
    }
    const uniqueTimes = new Set(dueDates.map((d) => d.getTime()));
    uniqueTimes.forEach((time) => {
      const d = new Date(time);
      if (d >= pStart && d <= pEnd) {
        const amt = getEffectiveBillAmount(bill, d, overrideMap);
        if (amt != null) total += amt;
      }
    });
  });
  return total;
}

// Build a Map of override keys ("billId_YYYY-MM-DD") to amounts
async function loadOverrideMap(userId, start, end) {
  const from = startOfDay(start);
  const to = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  const docs = await PaymentOverride.find({
    user: userId,
    date: { $gte: from, $lte: to },
  });
  const map = new Map();
  docs.forEach((d) => {
    const local = startOfDay(toLocalDate(d.date));
    const key = `${d.bill}_${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    map.set(key, Number(d.amount) || 0);
  });
  return map;
}

// Helper: sum expenses within a date range
async function sumExpensesInPeriod(userId, start, end) {
  // Normalize to full-day boundaries for the MongoDB query
  const from = startOfDay(start);
  const to = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);

  const expenseDocs = await Expense.find({
    $and: [
      { $or: [{ user: userId }, { userId: userId }] },
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

// GET /paycheck-current — current budget period summary using income sources
router.get("/paycheck-current", authRequired, async (req, res) => {
  try {
    const sources = await IncomeSource.find({ user: req.userId, isActive: true });
    if (!sources.length) {
      return res.status(400).json({ error: "No income sources configured." });
    }

    const today = new Date();
    const budget = getBudgetPeriod(sources, today);
    if (!budget) {
      return res.status(400).json({ error: "Unable to compute budget period." });
    }

    const { start, end, nextPayDate, totalIncome, sources: sourceBreakdown } = budget;

    // Bills due in this period (with override + lastPayment support)
    const bills = await Bill.find({ user: req.userId, isActive: { $ne: false } });
    const overrideMap = await loadOverrideMap(req.userId, start, end);
    const totalBills = sumBillsInPeriod(bills, start, end, overrideMap);

    // Expenses in this period
    const totalExpenses = await sumExpensesInPeriod(req.userId, start, end);

    // Savings this period
    const savingsGoals = await SavingsGoal.find({ userId: req.userId });
    const savingsThisPeriod = savingsGoals.reduce(
      (sum, goal) => sum + (Number(goal.perPaycheckAmount) || 0),
      0
    );

    // Investments this period
    const investments = await Investment.find({ userId: req.userId });
    let investmentsThisPeriod = 0;
    investments.forEach((inv) => {
      (inv.contributions || []).forEach((c) => {
        if (c?.date >= start && c?.date <= end) {
          investmentsThisPeriod += Number(c.amount) || 0;
        }
      });
    });

    // Balance = income - bills - expenses (savings/investments shown separately)
    const balance = totalIncome - totalBills - totalExpenses;

    // Days until next paycheck
    const msPerDay = 24 * 60 * 60 * 1000;
    let daysUntilNextPaycheck = null;
    if (nextPayDate) {
      const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const normalizedNext = new Date(
        nextPayDate.getFullYear(),
        nextPayDate.getMonth(),
        nextPayDate.getDate()
      );
      const diffMs = normalizedNext.getTime() - normalizedToday.getTime();
      let diffDays = Math.floor(diffMs / msPerDay) + 1;
      if (diffDays < 0) diffDays = 0;
      daysUntilNextPaycheck = diffDays;
    }

    // ── Next Paycheck Balance ──────────────────────────────────
    let nextPaycheckBalance = null;
    let nextPeriod = null;
    if (nextPayDate) {
      const nextBudget = getBudgetPeriod(sources, nextPayDate);
      if (nextBudget) {
        const nextStart = nextBudget.start;
        const nextEnd = nextBudget.end;
        const nextTotalIncome = nextBudget.totalIncome;
        const nextOverrideMap = await loadOverrideMap(req.userId, nextStart, nextEnd);
        const nextTotalBills = sumBillsInPeriod(bills, nextStart, nextEnd, nextOverrideMap);
        const nextTotalExpenses = await sumExpensesInPeriod(req.userId, nextStart, nextEnd);

        // Current balance rolls over + next period income - next period bills - next period expenses
        nextPaycheckBalance = balance + nextTotalIncome - nextTotalBills - nextTotalExpenses;
        nextPeriod = {
          start: nextStart.toISOString().slice(0, 10),
          end: nextEnd.toISOString().slice(0, 10),
          totalIncome: nextTotalIncome,
          totalBills: nextTotalBills,
          totalExpenses: nextTotalExpenses,
        };
      }
    }

    res.json({
      period: { start, end },
      totalIncome,
      totalBills,
      totalExpenses,
      savingsThisPeriod,
      investmentsThisPeriod,
      balance,
      leftToSpend: balance, // backward compat
      nextPayDate,
      daysUntilNextPaycheck,
      nextPaycheckBalance,
      nextPeriod,
      sources: sourceBreakdown,
      periodLabel: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      },
      nextPayDateLabel: nextPayDate ? nextPayDate.toISOString().slice(0, 10) : null,
    });
  } catch (error) {
    console.error("Error computing paycheck summary:", error);
    res.status(500).json({ error: "Unable to compute paycheck summary." });
  }
});

// GET /periods — per-source period info
router.get("/periods", authRequired, async (req, res) => {
  try {
    const sources = await IncomeSource.find({ user: req.userId, isActive: true });
    if (!sources.length) {
      return res.json({ periods: [] });
    }

    const today = new Date();
    const periods = getPeriodsForSources(sources, today);

    res.json({ periods });
  } catch (error) {
    console.error("Error computing periods:", error);
    res.status(500).json({ error: "Unable to compute periods." });
  }
});

module.exports = router;
