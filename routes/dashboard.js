const express = require("express");

const { authRequired } = require("../middleware/auth");
const IncomeSource = require("../models/IncomeSource");
const Bill = require("../models/Bill");
const Expense = require("../models/Expense");
const { getBudgetPeriod } = require("../utils/paycheckUtils");

const router = express.Router();

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

router.get("/summary", authRequired, async (req, res) => {
  try {
    const userId = req.userId;
    const now = new Date();

    const sources = await IncomeSource.find({ user: userId, isActive: true });
    if (!sources.length) {
      return res.json({
        hasSources: false,
        currentPeriod: null,
        calendar: null,
        categoryTotals: [],
      });
    }

    const budget = getBudgetPeriod(sources, now);
    if (!budget) {
      return res.json({
        hasSources: true,
        currentPeriod: null,
        calendar: null,
        categoryTotals: [],
      });
    }

    const { start, end, nextPayDate, totalIncome, sources: sourceBreakdown } = budget;

    // Determine month for calendar
    let year = now.getFullYear();
    let monthIndex = now.getMonth();
    if (req.query.month) {
      const [y, m] = req.query.month.split("-").map((v) => parseInt(v, 10));
      if (!Number.isNaN(y) && !Number.isNaN(m)) {
        year = y;
        monthIndex = m - 1;
      }
    }

    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0);

    const bills = await Bill.find({ user: userId, isActive: { $ne: false } });
    const periodExpenses = await Expense.find({
      $or: [{ user: userId }, { userId }],
      date: { $gte: start, $lte: end },
    });

    // Compute totals for current period
    let totalBills = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      bills.forEach((bill) => {
        if (bill.dueDayOfMonth === cursor.getDate()) {
          totalBills += Number(bill.amount) || 0;
        }
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const totalExpenses = periodExpenses.reduce(
      (sum, exp) => sum + (Number(exp.amount) || 0),
      0
    );

    const leftToSpend = totalIncome - totalBills - totalExpenses;

    const currentPeriod = {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      nextPayDate: nextPayDate.toISOString(),
      totalIncome,
      totalBills,
      totalExpenses,
      leftToSpend,
      sources: sourceBreakdown,
    };

    // Calendar for the selected month
    const daysInMonth = monthEnd.getDate();
    const monthExpenses = await Expense.find({
      $or: [{ user: userId }, { userId }],
      date: { $gte: monthStart, $lte: monthEnd },
    });

    const calendarDays = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, monthIndex, day);
      const iso = dateKey(dateObj);

      let billsTotal = 0;
      const items = [];

      bills.forEach((bill) => {
        if (bill.dueDayOfMonth === day) {
          billsTotal += Number(bill.amount) || 0;
          items.push({
            type: "bill",
            name: bill.name,
            amount: bill.amount,
            category: bill.category,
          });
        }
      });

      const dayExpenses = monthExpenses.filter((exp) => {
        const expDate = new Date(exp.date);
        return (
          expDate.getDate() === day &&
          expDate.getMonth() === monthIndex &&
          expDate.getFullYear() === year
        );
      });

      let expensesTotal = 0;
      dayExpenses.forEach((exp) => {
        expensesTotal += Number(exp.amount) || 0;
        items.push({
          type: "expense",
          name: exp.description || exp.category,
          amount: exp.amount,
          category: exp.category,
        });
      });

      // Check if any source has a payday on this date
      const isPayday = (sourceBreakdown || []).some((s) =>
        (s.paydays || []).includes(iso)
      );

      calendarDays.push({ date: iso, isPayday, billsTotal, expensesTotal, items });
    }

    // Category totals for the month
    const catMap = new Map();
    bills.forEach((bill) => {
      const key = bill.category || "Other";
      catMap.set(key, (catMap.get(key) || 0) + (Number(bill.amount) || 0));
    });
    monthExpenses.forEach((exp) => {
      const key = exp.category || "Other";
      catMap.set(key, (catMap.get(key) || 0) + (Number(exp.amount) || 0));
    });
    const categoryTotals = Array.from(catMap.entries()).map(([category, total]) => ({
      category,
      total,
    }));

    return res.json({
      hasSources: true,
      currentPeriod,
      calendar: { year, month: monthIndex + 1, days: calendarDays },
      categoryTotals,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
