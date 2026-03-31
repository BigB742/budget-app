const express = require("express");

const { authRequired } = require("../middleware/auth");
const IncomeSource = require("../models/IncomeSource");
const Bill = require("../models/Bill");
const Expense = require("../models/Expense");
const SavingsGoal = require("../models/SavingsGoal");
const Investment = require("../models/Investment");
const { getBudgetPeriod, getPeriodsForSources } = require("../utils/paycheckUtils");

const router = express.Router();

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

    // Bills due in this period
    const bills = await Bill.find({ user: req.userId, isActive: { $ne: false } });
    let totalBills = 0;
    bills.forEach((bill) => {
      const dueDates = [];
      const startMonthDate = new Date(start.getFullYear(), start.getMonth(), bill.dueDayOfMonth);
      dueDates.push(startMonthDate);
      if (start.getMonth() !== end.getMonth() || start.getFullYear() !== end.getFullYear()) {
        const endMonthDate = new Date(end.getFullYear(), end.getMonth(), bill.dueDayOfMonth);
        dueDates.push(endMonthDate);
      }
      const uniqueTimes = new Set(dueDates.map((d) => d.getTime()));
      uniqueTimes.forEach((time) => {
        const d = new Date(time);
        if (d >= start && d <= end) {
          totalBills += Number(bill.amount) || 0;
        }
      });
    });

    // Expenses in this period (fixed: use $and to avoid duplicate $or keys)
    const expenseDocs = await Expense.find({
      $and: [
        { $or: [{ user: req.userId }, { userId: req.userId }] },
        {
          $or: [
            { date: { $gte: start, $lte: end } },
            { date: { $exists: false }, createdAt: { $gte: start, $lte: end } },
          ],
        },
      ],
    });
    const totalExpenses = expenseDocs.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

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

    const leftToSpend =
      totalIncome - totalBills - totalExpenses - savingsThisPeriod - investmentsThisPeriod;

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

    res.json({
      period: { start, end },
      totalIncome,
      totalBills,
      totalExpenses,
      savingsThisPeriod,
      investmentsThisPeriod,
      leftToSpend,
      nextPayDate,
      daysUntilNextPaycheck,
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
