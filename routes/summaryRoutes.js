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

// GET /period-history?count=6 — past pay periods with summaries
router.get("/period-history", authRequired, async (req, res) => {
  try {
    const count = Math.min(Number(req.query.count) || 6, 26);
    const sources = await IncomeSource.find({ user: req.userId, isActive: true });
    if (!sources.length) return res.json({ periods: [] });

    const bills = await Bill.find({ user: req.userId, isActive: { $ne: false } });
    const today = new Date();
    let current = getBudgetPeriod(sources, today);
    if (!current) return res.json({ periods: [] });

    const results = [];
    // Walk backward: step back 1 day before current start to find previous period
    for (let i = 0; i < count; i++) {
      const prevDate = new Date(current.start);
      prevDate.setDate(prevDate.getDate() - 1);
      const prev = getBudgetPeriod(sources, prevDate);
      if (!prev) break;

      const overrides = await loadOverrideMap(req.userId, prev.start, prev.end);
      const totalBills = sumBillsInPeriod(bills, prev.start, prev.end, overrides);
      const totalExpenses = await sumExpensesInPeriod(req.userId, prev.start, prev.end);
      const balance = prev.totalIncome - totalBills - totalExpenses;

      results.push({
        start: prev.start.toISOString().slice(0, 10),
        end: prev.end.toISOString().slice(0, 10),
        totalIncome: prev.totalIncome,
        totalBills,
        totalExpenses,
        balance,
      });
      current = prev;
    }

    res.json({ periods: results });
  } catch (error) {
    console.error("Error computing period history:", error);
    res.status(500).json({ error: "Unable to compute period history." });
  }
});

// GET /expense-categories — expenses grouped by category for current period
router.get("/expense-categories", authRequired, async (req, res) => {
  try {
    const sources = await IncomeSource.find({ user: req.userId, isActive: true });
    if (!sources.length) return res.json({ categories: [], previousTotal: null });

    const today = new Date();
    const budget = getBudgetPeriod(sources, today);
    if (!budget) return res.json({ categories: [], previousTotal: null });

    const { start, end } = budget;
    const from = startOfDay(start);
    const to = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);

    const expenseDocs = await Expense.find({
      $and: [
        { $or: [{ user: req.userId }, { userId: req.userId }] },
        { date: { $gte: from, $lte: to } },
      ],
    });

    const catMap = {};
    expenseDocs.forEach((e) => {
      const cat = e.category || "Other";
      catMap[cat] = (catMap[cat] || 0) + (Number(e.amount) || 0);
    });

    const categories = Object.entries(catMap).map(([category, total]) => ({ category, total }));

    // Previous period total for comparison
    let previousTotal = null;
    const prevDate = new Date(start);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevBudget = getBudgetPeriod(sources, prevDate);
    if (prevBudget) {
      previousTotal = await sumExpensesInPeriod(req.userId, prevBudget.start, prevBudget.end);
    }

    res.json({ categories, previousTotal });
  } catch (error) {
    console.error("Error computing expense categories:", error);
    res.status(500).json({ error: "Unable to compute expense categories." });
  }
});

// GET /projected-balance?paydayDate=YYYY-MM-DD — projected balance at a future payday
// Chains pay periods from current through the target payday, rolling over balance each period.
router.get("/projected-balance", authRequired, async (req, res) => {
  try {
    const { paydayDate } = req.query;
    if (!paydayDate || !/^\d{4}-\d{2}-\d{2}$/.test(paydayDate)) {
      return res.status(400).json({ error: "paydayDate query param required (YYYY-MM-DD)." });
    }

    const targetDate = new Date(
      Number(paydayDate.slice(0, 4)),
      Number(paydayDate.slice(5, 7)) - 1,
      Number(paydayDate.slice(8, 10))
    );
    if (Number.isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: "Invalid paydayDate." });
    }

    const sources = await IncomeSource.find({ user: req.userId, isActive: true });
    if (!sources.length) {
      return res.status(400).json({ error: "No income sources configured." });
    }

    const bills = await Bill.find({ user: req.userId, isActive: { $ne: false } });

    const today = new Date();
    let currentPeriod = getBudgetPeriod(sources, today);
    if (!currentPeriod) {
      return res.status(400).json({ error: "Unable to compute current budget period." });
    }

    const MAX_ITERATIONS = 26;
    const periods = [];
    let rollover = 0;
    let iteration = 0;

    while (iteration < MAX_ITERATIONS) {
      const { start, end, nextPayDate, totalIncome } = currentPeriod;

      const overrideMap = await loadOverrideMap(req.userId, start, end);
      const totalBills = sumBillsInPeriod(bills, start, end, overrideMap);
      const totalExpenses = await sumExpensesInPeriod(req.userId, start, end);

      const periodBalance = rollover + totalIncome - totalBills - totalExpenses;

      periods.push({
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
        totalIncome,
        totalBills,
        totalExpenses,
        rollover,
        balance: periodBalance,
      });

      // Check if target falls within this period
      const pStart = startOfDay(start);
      const pEnd = startOfDay(end);
      const pTarget = startOfDay(targetDate);
      if (pTarget >= pStart && pTarget <= pEnd) {
        // This period contains the target payday
        const lastPeriod = periods[periods.length - 1];
        return res.json({
          paydayDate,
          paycheckAmount: totalIncome,
          rollover: lastPeriod.rollover,
          totalAvailable: lastPeriod.rollover + totalIncome,
          billsThisPeriod: totalBills,
          expensesThisPeriod: totalExpenses,
          estimatedBalance: periodBalance,
          periods,
        });
      }

      // Advance to the next period
      rollover = periodBalance;
      const nextBudget = getBudgetPeriod(sources, nextPayDate);
      if (!nextBudget) {
        return res.status(400).json({ error: "Unable to compute next budget period." });
      }
      currentPeriod = nextBudget;
      iteration++;
    }

    return res.status(400).json({
      error: `Target payday ${paydayDate} is more than ${MAX_ITERATIONS} pay periods away. Cannot project that far.`,
    });
  } catch (error) {
    console.error("Error computing projected balance:", error);
    res.status(500).json({ error: "Unable to compute projected balance." });
  }
});

module.exports = router;
