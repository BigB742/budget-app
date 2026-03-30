const express = require("express");

const { authRequired } = require("../middleware/auth");
const PaySchedule = require("../models/PaySchedule");
const Income = require("../models/Income");
const Bill = require("../models/Bill");
const Expense = require("../models/Expense");

const router = express.Router();

// Helpers
function createLocalDate(y, mIndex, d) {
  return new Date(y, mIndex, d);
}

function sameYMD(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

router.get("/summary", authRequired, async (req, res) => {
  try {
    const userId = req.userId || req.user?._id;
    const now = new Date();

    // Determine which month to show
    let year = now.getFullYear();
    let monthIndex = now.getMonth(); // 0-based

    if (req.query.month) {
      const [y, m] = req.query.month.split("-").map((v) => parseInt(v, 10));
      if (!Number.isNaN(y) && !Number.isNaN(m)) {
        year = y;
        monthIndex = m - 1;
      }
    }

    const monthStart = createLocalDate(year, monthIndex, 1);
    const monthEnd = createLocalDate(year, monthIndex + 1, 0); // last day of month

    const schedule = await PaySchedule.findOne({ user: userId });
    if (!schedule) {
      return res.json({
        hasSchedule: false,
        currentPeriod: null,
        projectedBalance: [],
        calendar: { year, month: monthIndex + 1, days: [] },
        categoryTotals: [],
      });
    }

    // Fetch paychecks around the month
    const paychecks = await Income.find({
      user: userId,
      type: "paycheck",
      date: {
        $gte: createLocalDate(year, monthIndex - 1, 1),
        $lte: createLocalDate(year, monthIndex + 2, 0),
      },
    }).sort({ date: 1 });

    if (!paychecks.length) {
      return res.json({
        hasSchedule: true,
        currentPeriod: null,
        projectedBalance: [],
        calendar: { year, month: monthIndex + 1, days: [] },
        categoryTotals: [],
      });
    }

    const billsQuery = { user: userId };
    const bills = await Bill.find(billsQuery);

    const expenses = await Expense.find({
      user: userId,
      date: { $gte: monthStart, $lte: monthEnd },
    });

    // ---------- Determine current pay period ----------
    const todayLocal = createLocalDate(now.getFullYear(), now.getMonth(), now.getDate());

    let prevPaycheck = paychecks[0];
    let nextPaycheck = paychecks[paychecks.length - 1];

    for (let i = 0; i < paychecks.length; i += 1) {
      const p = paychecks[i];
      if (p.date <= todayLocal) {
        prevPaycheck = p;
      } else {
        nextPaycheck = p;
        break;
      }
    }

    const periodStart = createLocalDate(
      prevPaycheck.date.getFullYear(),
      prevPaycheck.date.getMonth(),
      prevPaycheck.date.getDate()
    );
    const periodEndExclusive = createLocalDate(
      nextPaycheck.date.getFullYear(),
      nextPaycheck.date.getMonth(),
      nextPaycheck.date.getDate()
    );

    const paycheckAmount = prevPaycheck.amount;
    const autoSavings = schedule.autoSavings || 0;
    const autoInvesting = schedule.autoInvesting || 0;

    const startingSpendable = paycheckAmount - autoSavings - autoInvesting;

    // ---------- Build per-day totals for this pay period ----------
    const periodDaily = new Map();

    let cursor = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate());

    while (cursor < periodEndExclusive) {
      const key = dateKey(cursor);
      if (!periodDaily.has(key)) {
        periodDaily.set(key, { billsTotal: 0, expensesTotal: 0 });
      }
      const entry = periodDaily.get(key);

      bills.forEach((bill) => {
        const isOngoing =
          bill.remainingMonths === null ||
          bill.remainingMonths === undefined ||
          bill.remainingMonths > 0;

        if (!isOngoing) return;

        if (bill.dueDay === cursor.getDate()) {
          entry.billsTotal += bill.amount;
        }
      });

      cursor = createLocalDate(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    }

    const periodExpenses = await Expense.find({
      user: userId,
      date: { $gte: periodStart, $lt: periodEndExclusive },
    });

    periodExpenses.forEach((exp) => {
      const d = createLocalDate(exp.date.getFullYear(), exp.date.getMonth(), exp.date.getDate());
      const key = dateKey(d);
      if (!periodDaily.has(key)) {
        periodDaily.set(key, { billsTotal: 0, expensesTotal: 0 });
      }
      periodDaily.get(key).expensesTotal += exp.amount;
    });

    // ---------- Compute totals for donut ----------
    let totalBillsAndExpenses = 0;

    periodDaily.forEach((val) => {
      totalBillsAndExpenses += val.billsTotal + val.expensesTotal;
    });

    const leftToSpend = startingSpendable - totalBillsAndExpenses;

    const currentPeriod = {
      startDate: periodStart.toISOString(),
      endDateExclusive: periodEndExclusive.toISOString(),
      paycheckAmount,
      autoSavings,
      autoInvesting,
      startingSpendable,
      billsAndExpensesTotal: totalBillsAndExpenses,
      leftToSpend,
      nextPayday: nextPaycheck.date.toISOString(),
    };

    // ---------- Calendar for the selected month ----------
    const daysInMonth = monthEnd.getDate();
    const calendarDays = [];

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateObj = createLocalDate(year, monthIndex, day);
      const iso = dateKey(dateObj);

      const isPayday = paychecks.some((p) => sameYMD(p.date, dateObj));

      let billsTotal = 0;
      const items = [];

      bills.forEach((bill) => {
        const isOngoing =
          bill.remainingMonths === null ||
          bill.remainingMonths === undefined ||
          bill.remainingMonths > 0;
        if (!isOngoing) return;

        if (bill.dueDay === day) {
          billsTotal += bill.amount;
          items.push({
            type: "bill",
            name: bill.name,
            amount: bill.amount,
            category: bill.category,
          });
        }
      });

      const dayExpenses = expenses.filter((exp) => sameYMD(exp.date, dateObj));
      let expensesTotal = 0;
      dayExpenses.forEach((exp) => {
        expensesTotal += exp.amount;
        items.push({
          type: "expense",
          name: exp.description || exp.category,
          amount: exp.amount,
          category: exp.category,
        });
      });

      calendarDays.push({
        date: iso,
        isPayday,
        billsTotal,
        expensesTotal,
        items,
      });
    }

    // ---------- Category totals for the month ----------
    const catMap = new Map();

    bills.forEach((bill) => {
      const key = bill.category || "Other";
      catMap.set(key, (catMap.get(key) || 0) + bill.amount);
    });

    expenses.forEach((exp) => {
      const key = exp.category || "Other";
      catMap.set(key, (catMap.get(key) || 0) + exp.amount);
    });

    const categoryTotals = Array.from(catMap.entries()).map(([category, total]) => ({
      category,
      total,
    }));

    return res.json({
      hasSchedule: true,
      currentPeriod,
      projectedBalance: [],
      calendar: {
        year,
        month: monthIndex + 1,
        days: calendarDays,
      },
      categoryTotals,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
