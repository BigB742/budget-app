const express = require("express");

const { authRequired } = require("../middleware/auth");
const User = require("../models/User");
const IncomeSource = require("../models/IncomeSource");
const OneTimeIncome = require("../models/OneTimeIncome");
const Bill = require("../models/Bill");
const Expense = require("../models/Expense");
const SavingsGoal = require("../models/SavingsGoal");
const Investment = require("../models/Investment");
const { getBudgetPeriod, getPeriodsForSources, toLocalDate, toDateString, getPaydaysInRange } = require("../utils/paycheckUtils");
const PaymentPlan = require("../models/PaymentPlan");
const {
  startOfDay,
  endOfDay,
  getEffectiveBillAmount,
  sumBillsInPeriod,
  sumExpensesInPeriod,
  loadOverrideMap,
  loadBillPayments,
  computePeriodBalance,
} = require("../utils/financeEngine");

const router = express.Router();

// GET /paycheck-current — current budget period summary using income sources
router.get("/paycheck-current", authRequired, async (req, res) => {
  try {
    // Brand-new accounts (no income sources yet) still need a real
    // balance number. We show the onboarding balance minus any expenses
    // they've logged so far — they can't have bills in this state
    // without going through onboarding, so totalBillsDue is 0.
    const buildEmptyResponse = async () => {
      const u = await User.findById(req.userId).select("currentBalance createdAt");
      const cb = Number(u?.currentBalance) || 0;
      const createdAt = u?.createdAt ? new Date(u.createdAt) : new Date(0);
      const spent = await sumExpensesInPeriod(req.userId, createdAt, new Date());
      return {
        period: null, totalIncome: 0, recurringIncome: 0, oneTimeIncome: 0,
        totalBills: 0, totalExpenses: 0, totalBillsDue: 0, totalExpensesSpent: spent,
        savingsThisPeriod: 0, investmentsThisPeriod: 0,
        balance: cb - spent, currentBalance: cb, leftToSpend: cb - spent,
        nextPayDate: null, daysUntilNextPaycheck: null,
        nextPaycheckBalance: null, nextPeriod: null, sources: [],
        periodLabel: { start: null, end: null }, nextPayDateLabel: null, empty: true,
      };
    };

    const sources = await IncomeSource.find({ user: req.userId, isActive: true });
    if (!sources.length) return res.json(await buildEmptyResponse());

    const today = new Date();
    const budget = getBudgetPeriod(sources, today);
    if (!budget) return res.json(await buildEmptyResponse());

    const { start, end, nextPayDate, totalIncome: recurringIncome, sources: sourceBreakdown } = budget;

    // Prefetch bills + period-scoped override/payment maps once — reused by
    // both engine calls below.
    const bills = await Bill.find({ user: req.userId, isActive: { $ne: false } });
    const overrideMap = await loadOverrideMap(req.userId, start, end);
    const payments = await loadBillPayments(req.userId, start, end);

    // Savings + investments (informational response fields — not part of
    // the spendable math because the engine handles that).
    const savingsGoals = await SavingsGoal.find({ userId: req.userId });
    const savingsThisPeriod = savingsGoals.reduce((s, g) => s + (Number(g.perPaycheckAmount) || 0), 0);
    const totalSaved = savingsGoals.reduce((s, g) => s + (Number(g.savedAmount) || 0), 0);
    const investments = await Investment.find({ userId: req.userId });
    let investmentsThisPeriod = 0;
    investments.forEach((inv) => {
      (inv.contributions || []).forEach((c) => {
        if (c?.date >= start && c?.date <= end) {
          investmentsThisPeriod += Number(c.amount) || 0;
        }
      });
    });

    const userDoc = await User.findById(req.userId).select("currentBalance createdAt");
    const currentBalance = Number(userDoc?.currentBalance) || 0;
    const userCreatedAt = userDoc?.createdAt ? new Date(userDoc.createdAt) : new Date(0);

    // Informational full-period totals used by the dashboard stat cards
    // (totalIncome, totalBills, totalExpenses for the current pay period).
    // This is NOT the balance source of truth anymore — see below.
    const periodTotals = await computePeriodBalance({
      userId: req.userId,
      periodStart: start,
      periodEnd: end,
      startingBalance: 0,
      recurringIncome,
      bills,
      overrideMap,
      payments,
    });

    // ───────────────────────────────────────────────────────────────────
    // "You Can Spend" — SOURCE OF TRUTH
    //
    //   balance = user.currentBalance
    //           − SUM(expenses where createdAt ≤ date ≤ today)
    //           − SUM(bills due from today through next paycheck)
    //
    // Income/paycheck projections deliberately DO NOT feed this number.
    // The user enters their real bank balance during onboarding; that is
    // the seed, and every expense they log decrements from it. Expenses
    // dated BEFORE signup are historical stats only and are excluded
    // from the sum by the date >= createdAt filter.
    //
    // Bills are recurring (dueDayOfMonth), so we reuse sumBillsInPeriod
    // with a window of [today, end-of-current-pay-period]. That helper
    // respects payment overrides and already-paid bills, matching the
    // "bills due before next paycheck" intent without double-counting a
    // bill the user already marked paid.
    // ───────────────────────────────────────────────────────────────────
    const totalExpensesSpent = await sumExpensesInPeriod(req.userId, userCreatedAt, today);
    const totalBillsDue = sumBillsInPeriod(bills, today, end, overrideMap, payments);

    // Payment Plans: sum unpaid entries whose date falls within the current
    // pay period. Dates are stored as noon UTC from the parseLocalDate fix,
    // so we compare date-only (year/month/day) to avoid time-component drift.
    const allPlans = await PaymentPlan.find({ userId: req.userId });
    const toYMD = (d) => { const dt = new Date(d); return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate(); };
    const periodStartYMD = toYMD(start);
    const periodEndYMD = toYMD(end);
    let totalPaymentPlansDue = 0;
    allPlans.forEach((plan) => {
      (plan.payments || []).forEach((p) => {
        if (p.paid) return;
        const ymd = toYMD(p.date);
        if (ymd >= periodStartYMD && ymd <= periodEndYMD) {
          totalPaymentPlansDue += Number(p.amount) || 0;
        }
      });
    });

    const balance = currentBalance - totalExpensesSpent - totalBillsDue - totalPaymentPlansDue;

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

    // ── Next Paycheck Balance (routed through the engine) ──────
    // Previous period boundaries — used by the Expense page "Last period" tab
    // and the "spent less" celebration modal.
    let previousPeriod = null;
    let spentPreviousPeriod = null;
    const prevDate = new Date(start);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevBudget = getBudgetPeriod(sources, prevDate);
    if (prevBudget) {
      previousPeriod = { start: toDateString(prevBudget.start), end: toDateString(prevBudget.end) };
      spentPreviousPeriod = await sumExpensesInPeriod(req.userId, prevBudget.start, prevBudget.end);
    }

    let nextPaycheckBalance = null;
    let nextPeriod = null;
    if (nextPayDate) {
      const nextBudget = getBudgetPeriod(sources, nextPayDate);
      if (nextBudget) {
        const nextOverrideMap = await loadOverrideMap(req.userId, nextBudget.start, nextBudget.end);
        const nextPayments = await loadBillPayments(req.userId, nextBudget.start, nextBudget.end);

        const nextResult = await computePeriodBalance({
          userId: req.userId,
          periodStart: nextBudget.start,
          periodEnd: nextBudget.end,
          startingBalance: balance, // rollover from the current period's end
          recurringIncome: nextBudget.totalIncome,
          bills,
          overrideMap: nextOverrideMap,
          payments: nextPayments,
        });

        nextPaycheckBalance = nextResult.estimatedEnd;
        nextPeriod = {
          start: toDateString(nextBudget.start),
          end: toDateString(nextBudget.end),
          recurringIncome: nextResult.recurringIncome,
          oneTimeIncome: nextResult.oneTimeIncome,
          totalIncome: nextResult.totalIncome,
          totalBills: nextResult.totalBills,
          totalExpenses: nextResult.totalExpenses,
        };
      }
    }

    res.json({
      period: { start, end },
      previousPeriod,
      recurringIncome: periodTotals.recurringIncome,
      oneTimeIncome: periodTotals.oneTimeIncome,
      totalIncome: periodTotals.totalIncome,
      totalBills: periodTotals.totalBills,
      totalExpenses: periodTotals.totalExpenses,
      // Fields that drive the balance-of-truth formula. The dashboard
      // can display these directly or recompute locally if it wants.
      totalBillsDue,
      totalExpensesSpent,
      totalPaymentPlansDue,
      spentCurrentPeriod: periodTotals.totalExpenses,
      spentPreviousPeriod,
      savingsThisPeriod,
      totalSaved,
      investmentsThisPeriod,
      balance,
      currentBalance,
      nextPayDate,
      daysUntilNextPaycheck,
      nextPaycheckBalance,
      nextPeriod,
      sources: sourceBreakdown,
      periodLabel: {
        start: toDateString(start),
        end: toDateString(end),
      },
      nextPayDateLabel: nextPayDate ? toDateString(nextPayDate) : null,
    });
  } catch (error) {
    console.error("Error computing paycheck summary:", error);
    res.status(500).json({ error: "Unable to compute paycheck summary." });
  }
});

// GET /paydays?from=YYYY-MM-DD&to=YYYY-MM-DD — all payday dates in range
router.get("/paydays", authRequired, async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.json({ paydays: [] });
    const sources = await IncomeSource.find({ user: req.userId, isActive: true });
    if (!sources.length) return res.json({ paydays: [] });
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    const rangeStart = new Date(fy, fm - 1, fd);
    const rangeEnd = new Date(ty, tm - 1, td);
    const allPaydays = new Set();
    for (const source of sources) {
      const paydays = getPaydaysInRange(source.nextPayDate, source.frequency, rangeStart, rangeEnd);
      paydays.forEach((d) => allPaydays.add(toDateString(d)));
    }
    res.json({ paydays: [...allPaydays].sort() });
  } catch (error) {
    console.error("Error computing paydays:", error);
    res.status(500).json({ error: "Unable to compute paydays." });
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

      // Route historical period math through the shared engine so its
      // totals (bills, expenses, one-time income) match the rest of the
      // app. Note: period-history still reports per-period NET cash flow
      // (startingBalance = 0), not a running spendable balance — it's a
      // "how did I do this period" retrospective, not a rollover chain.
      const overrides = await loadOverrideMap(req.userId, prev.start, prev.end);
      const prevPayments = await loadBillPayments(req.userId, prev.start, prev.end);
      const result = await computePeriodBalance({
        userId: req.userId,
        periodStart: prev.start,
        periodEnd: prev.end,
        startingBalance: 0,
        recurringIncome: prev.totalIncome,
        bills,
        overrideMap: overrides,
        payments: prevPayments,
      });

      results.push({
        start: toDateString(prev.start),
        end: toDateString(prev.end),
        totalIncome: result.totalIncome,
        totalBills: result.totalBills,
        totalExpenses: result.totalExpenses,
        balance: result.estimatedEnd,
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
        { category: { $ne: "Savings" } }, // Savings are transfers, never spending
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
    const allPlansForProjection = await PaymentPlan.find({ userId: req.userId });
    const toYMDp = (d) => { const dt = new Date(d); return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate(); };

    // Seed the chain with the user's current bank balance — the same starting
    // point the dashboard uses. Previously this loop started with rollover = 0
    // which produced wrong numbers for the first period (and therefore every
    // subsequent period). The "You Can Spend" value on the dashboard and the
    // "Estimated balance" shown on the calendar snapshot for the current
    // period must match, and they now do.
    const userDoc = await User.findById(req.userId).select("createdAt currentBalance");
    const initialBalance = Number(userDoc?.currentBalance) || 0;

    const today = new Date();
    const todayNorm = startOfDay(today);
    let currentPeriod = getBudgetPeriod(sources, today);
    if (!currentPeriod) {
      return res.status(400).json({ error: "Unable to compute current budget period." });
    }

    // Premium gate: future-period projections (any payday after the
    // current period's end) require an active subscription. Free users
    // can only see snapshots for the period they're already in. The UI
    // hides future months for free users, but the API enforces it too
    // so a determined caller can't bypass via direct fetch.
    if (startOfDay(targetDate) > startOfDay(currentPeriod.end) && !req.isPremium) {
      return res.status(403).json({
        error: "Future-period projections are a Premium feature.",
        upgradeRequired: true,
      });
    }

    // True when the user was created during the current (onboarding) pay
    // period. Only the snapshot for the current period uses the "Opening
    // balance" label — future-period snapshots get "Rollover from previous"
    // showing the real carried-forward balance.
    const isOnboardingPeriod = !!(
      userDoc?.createdAt &&
      new Date(userDoc.createdAt) >= startOfDay(currentPeriod.start)
    );

    const MAX_ITERATIONS = 26;
    const periods = [];
    let rollover = initialBalance;
    let iteration = 0;

    while (iteration < MAX_ITERATIONS) {
      const { start, end, nextPayDate, totalIncome } = currentPeriod;

      const overrideMap = await loadOverrideMap(req.userId, start, end);
      const periodPayments = await loadBillPayments(req.userId, start, end);

      // Route through the shared engine. Iteration 0 (current period)
      // uses windowStart=todayNorm and recurringIncome=0 — matches the
      // dashboard exactly. Future periods use full period + paycheck.
      const isCurrent = iteration === 0;
      const result = await computePeriodBalance({
        userId: req.userId,
        periodStart: start,
        periodEnd: end,
        startingBalance: rollover,
        recurringIncome: isCurrent ? 0 : totalIncome,
        bills,
        overrideMap,
        payments: periodPayments,
        windowStart: isCurrent ? todayNorm : undefined,
      });

      periods.push({
        start: toDateString(start),
        end: toDateString(end),
        totalIncome: result.totalIncome,
        totalBills: result.totalBills,
        totalExpenses: result.totalExpenses,
        rollover,
        balance: result.estimatedEnd,
      });

      // Check if target falls within this period
      const pStart = startOfDay(start);
      const pEnd = startOfDay(end);
      const pTarget = startOfDay(targetDate);
      if (pTarget >= pStart && pTarget <= pEnd) {
        // Sum unpaid payment plan payments for this period
        const sYMD = toYMDp(start);
        const eYMD = toYMDp(end);
        let plansDueThisPeriod = 0;
        allPlansForProjection.forEach((plan) => {
          (plan.payments || []).forEach((pp) => {
            if (pp.paid) return;
            const ymd = toYMDp(pp.date);
            if (ymd >= sYMD && ymd <= eYMD) plansDueThisPeriod += Number(pp.amount) || 0;
          });
        });

        return res.json({
          paydayDate,
          paycheckAmount: result.totalIncome,
          rollover,
          totalAvailable: rollover + result.totalIncome,
          billsThisPeriod: result.totalBills,
          plansDueThisPeriod,
          expensesThisPeriod: result.totalExpenses,
          estimatedBalance: result.estimatedEnd - plansDueThisPeriod,
          periods,
          isFirstPeriod: isCurrent && isOnboardingPeriod,
        });
      }

      // Advance to the next period
      rollover = result.estimatedEnd;
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

// GET /year-to-date — YTD income projection, bills, expenses by category
router.get("/year-to-date", authRequired, async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);

    // 1. Active income sources — projected income for the full year
    const sources = await IncomeSource.find({ user: req.userId, isActive: true });
    let projectedIncome = 0;
    for (const source of sources) {
      const paydays = getPaydaysInRange(source.nextPayDate, source.frequency, yearStart, yearEnd);
      projectedIncome += paydays.length * (Number(source.amount) || 0);
    }

    // 2. Active bills — projected annual cost, respecting lastPaymentDate
    const bills = await Bill.find({ user: req.userId, isActive: { $ne: false } });
    let projectedBills = 0;
    const billBreakdown = [];

    for (const bill of bills) {
      const billStart = bill.startDate ? startOfDay(toLocalDate(bill.startDate)) : null;
      const lastPay = bill.lastPaymentDate ? startOfDay(toLocalDate(bill.lastPaymentDate)) : null;
      let annualTotal = 0;

      for (let month = 0; month < 12; month++) {
        const dueDate = new Date(year, month, bill.dueDayOfMonth);
        if (billStart && dueDate < billStart) continue;
        if (lastPay && dueDate > lastPay) continue;
        annualTotal += Number(bill.amount) || 0;
      }

      projectedBills += annualTotal;
      billBreakdown.push({ name: bill.name, annualTotal });
    }

    // 3. Expenses for the year, grouped by category
    const yearFrom = startOfDay(yearStart);
    const yearTo = new Date(year, 11, 31, 23, 59, 59, 999);

    const expenseDocs = await Expense.find({
      $and: [
        { $or: [{ user: req.userId }, { userId: req.userId }] },
        { category: { $ne: "Savings" } }, // YTD spending chart: savings are transfers, not spending
        {
          $or: [
            { date: { $gte: yearFrom, $lte: yearTo } },
            { date: { $exists: false }, createdAt: { $gte: yearFrom, $lte: yearTo } },
          ],
        },
      ],
    });

    const catMap = {};
    let totalExpenses = 0;
    expenseDocs.forEach((e) => {
      const amt = Number(e.amount) || 0;
      const cat = e.category || "Other";
      catMap[cat] = (catMap[cat] || 0) + amt;
      totalExpenses += amt;
    });

    const expenseBreakdown = Object.entries(catMap).map(([category, total]) => ({ category, total }));

    // 4. One-time income for the year
    const oneTimeIncomes = await OneTimeIncome.find({
      user: req.userId,
      date: { $gte: yearFrom, $lte: yearTo },
    });
    const oneTimeIncomeTotal = oneTimeIncomes.reduce((s, i) => s + (Number(i.amount) || 0), 0);

    // 5. Remaining
    const totalIncome = projectedIncome + oneTimeIncomeTotal;
    const remaining = totalIncome - projectedBills - totalExpenses;

    res.json({
      year,
      projectedIncome: totalIncome,
      recurringIncome: projectedIncome,
      oneTimeIncome: oneTimeIncomeTotal,
      projectedBills,
      totalExpenses,
      remaining,
      billBreakdown,
      expenseBreakdown,
    });
  } catch (error) {
    console.error("Error computing year-to-date summary:", error);
    res.status(500).json({ error: "Unable to compute year-to-date summary." });
  }
});

// GET /monthly-breakdown?year=2026&month=4 — full financial breakdown for a specific month
router.get("/monthly-breakdown", authRequired, async (req, res) => {
  try {
    const year = Number(req.query.year);
    const month = Number(req.query.month); // 1-12

    if (!year || !month || month < 1 || month > 12) {
      return res.status(400).json({ error: "Valid year and month (1-12) query params required." });
    }

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0); // last day of the month

    // 1. Recurring income — paydays that fall in this month
    const sources = await IncomeSource.find({ user: req.userId, isActive: true });
    let recurringIncome = 0;
    for (const source of sources) {
      const paydays = getPaydaysInRange(source.nextPayDate, source.frequency, monthStart, monthEnd);
      recurringIncome += paydays.length * (Number(source.amount) || 0);
    }

    // 2. One-time income in this month
    const monthFrom = startOfDay(monthStart);
    const monthTo = new Date(year, month - 1, monthEnd.getDate(), 23, 59, 59, 999);

    const oneTimeIncomes = await OneTimeIncome.find({
      user: req.userId,
      date: { $gte: monthFrom, $lte: monthTo },
    });
    const oneTimeIncome = oneTimeIncomes.reduce((s, i) => s + (Number(i.amount) || 0), 0);

    const totalIncome = recurringIncome + oneTimeIncome;

    // 3. Bills due in this month
    const bills = await Bill.find({ user: req.userId, isActive: { $ne: false } });
    const overrideMap = await loadOverrideMap(req.userId, monthStart, monthEnd);

    let totalBills = 0;
    const billBreakdown = [];

    for (const bill of bills) {
      const dueDate = new Date(year, month - 1, bill.dueDayOfMonth);
      const dueDateLocal = startOfDay(dueDate);

      const amt = getEffectiveBillAmount(bill, dueDateLocal, overrideMap);
      if (amt != null) {
        totalBills += amt;
        billBreakdown.push({ name: bill.name, amount: amt });
      }
    }

    // 4. Expenses for the month, grouped by category (savings excluded)
    const expenseDocs = await Expense.find({
      $and: [
        { $or: [{ user: req.userId }, { userId: req.userId }] },
        { category: { $ne: "Savings" } },
        {
          $or: [
            { date: { $gte: monthFrom, $lte: monthTo } },
            { date: { $exists: false }, createdAt: { $gte: monthFrom, $lte: monthTo } },
          ],
        },
      ],
    });

    const catMap = {};
    let totalExpenses = 0;
    expenseDocs.forEach((e) => {
      const amt = Number(e.amount) || 0;
      const cat = e.category || "Other";
      catMap[cat] = (catMap[cat] || 0) + amt;
      totalExpenses += amt;
    });

    const expensesByCategory = Object.entries(catMap).map(([category, total]) => ({ category, total }));

    // 5. Net
    const net = totalIncome - totalBills - totalExpenses;

    res.json({
      year,
      month,
      totalIncome,
      recurringIncome,
      oneTimeIncome,
      totalBills,
      totalExpenses,
      net,
      expensesByCategory,
      billBreakdown,
    });
  } catch (error) {
    console.error("Error computing monthly breakdown:", error);
    res.status(500).json({ error: "Unable to compute monthly breakdown." });
  }
});

// GET /projected-annual-income — projected income for the current calendar year
//
// Generates ALL payday dates for the calendar year per income source using
// getPaydaysInRange(anchorDate, frequency, rangeStart, rangeEnd), multiplies
// by per-paycheck amount, and adds one-time income.
router.get("/projected-annual-income", authRequired, async (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
    const tomorrowStart = new Date(year, now.getMonth(), now.getDate() + 1);

    const sources = await IncomeSource.find({ user: req.userId, isActive: true });

    // One-time income (past + future for the year)
    const onetimeAll = await OneTimeIncome.find({
      user: req.userId,
      date: { $gte: yearStart, $lte: yearEnd },
    });
    const onetimeTotal = onetimeAll.reduce((s, i) => s + (Number(i.amount) || 0), 0);

    // Recurring paycheck income: for each source, generate all paydays in the
    // year using the source's anchor date (nextPayDate) + frequency.
    let recurringTotal = 0;
    let totalPaychecks = 0;
    let remainingPaychecks = 0;
    sources.forEach((src) => {
      const anchor = src.nextPayDate || src.lastPaycheckDate;
      if (!anchor || !src.frequency) return;
      const srcPaydays = getPaydaysInRange(anchor, src.frequency, yearStart, yearEnd);
      const count = srcPaydays.length;
      const future = srcPaydays.filter((d) => d >= tomorrowStart).length;
      recurringTotal += count * (Number(src.amount) || 0);
      totalPaychecks += count;
      remainingPaychecks += future;
    });

    const projected = recurringTotal + onetimeTotal;

    res.json({ projected, recurringTotal, onetimeTotal, totalPaychecks, remainingPaychecks });
  } catch (err) {
    console.error("Error computing projected annual income:", err.message);
    res.status(500).json({ error: "Unable to compute projected annual income." });
  }
});

module.exports = router;
