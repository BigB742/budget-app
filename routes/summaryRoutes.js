const express = require("express");

const { authRequired } = require("../middleware/auth");
const User = require("../models/User");
const Bill = require("../models/Bill");
const Transaction = require("../models/Transaction");
const Expense = require("../models/Expense");
const SavingsGoal = require("../models/SavingsGoal");
const Investment = require("../models/Investment");
const { getCurrentPayPeriod } = require("../utils/paycheckUtils");

const router = express.Router();

router.get("/paycheck-current", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const { amount, frequency, lastPaycheckDate } = user.incomeSettings || {};
    if (!amount || !frequency || !lastPaycheckDate) {
      return res.status(400).json({ error: "Income settings are incomplete for this user." });
    }

    const today = new Date();
    const periodInfo = getCurrentPayPeriod({
      lastPaycheckDate,
      frequency,
      targetDate: today,
    });

    if (!periodInfo) {
      return res.status(400).json({ message: "Unable to compute paycheck period" });
    }

    const { start, end, nextPayDate } = periodInfo;

    const bills = await Bill.find({ user: user._id, isActive: { $ne: false } });

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

    const transactions = await Transaction.find({
      user: user._id,
      type: { $in: ["savings", "investment"] },
      date: { $gte: start, $lte: end },
    });

    const expenseDocs = await Expense.find({
      $or: [{ user: user._id }, { userId: user._id }],
      $or: [
        { date: { $gte: start, $lte: end } },
        { date: { $exists: false }, createdAt: { $gte: start, $lte: end } },
      ],
    });

    let totalExpenses = 0;
    let totalSavings = 0;
    let totalInvestments = 0;

    transactions.forEach((txn) => {
      const amt = Number(txn.amount) || 0;
      if (txn.type === "expense") totalExpenses += amt;
      if (txn.type === "savings") totalSavings += amt;
      if (txn.type === "investment") totalInvestments += amt;
    });

    totalExpenses += expenseDocs.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);

    const savingsGoals = await SavingsGoal.find({ userId: user._id });
    const savingsThisPeriod = savingsGoals.reduce(
      (sum, goal) => sum + (Number(goal.perPaycheckAmount) || 0),
      0
    );

    const investments = await Investment.find({ userId: user._id });
    let investmentsThisPeriod = 0;
    investments.forEach((inv) => {
      (inv.contributions || []).forEach((c) => {
        if (c?.date >= start && c?.date <= end) {
          investmentsThisPeriod += Number(c.amount) || 0;
        }
      });
    });

    const startingBalance = Number(amount) || 0;
    const leftToSpend =
      startingBalance -
      totalBills -
      totalExpenses -
      (totalSavings + savingsThisPeriod) -
      (totalInvestments + investmentsThisPeriod);

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
      paycheckAmount: startingBalance,
      frequency,
      totalBills,
      totalExpenses,
      totalSavings: totalSavings + savingsThisPeriod,
      savingsThisPeriod,
      investmentsThisPeriod,
      totalInvestments,
      leftToSpend,
      nextPayDate,
      daysUntilNextPaycheck,
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

module.exports = router;
