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
  computeSpendable,
} = require("../utils/financeEngine");
const { todayInAppTz } = require("../utils/appTz");

const router = express.Router();

// PayPulse pins every server-side calendar-day calculation to
// America/Los_Angeles via utils/appTz. resolveToday honors a client-
// supplied ?localDate=YYYY-MM-DD override (used by tests / future
// multi-tz callers) and falls back to LA today.
function resolveToday(req) {
  const ld = req.query.localDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(ld || ""))) {
    return new Date(
      Number(ld.slice(0, 4)),
      Number(ld.slice(5, 7)) - 1,
      Number(ld.slice(8, 10)),
    );
  }
  return todayInAppTz();
}

// GET /paycheck-current — current budget period summary using income sources
router.get("/paycheck-current", authRequired, async (req, res) => {
  try {
    // Brand-new accounts (no income sources yet) still need a real
    // balance number. The cumulative formula degrades gracefully — with
    // no anchor it returns spendable=currentBalance, but we want a few
    // extra display fields here so the empty-state UI doesn't hit
    // missing keys. The expense total is "since signup" because there
    // is no pay period yet.
    const buildEmptyResponse = async () => {
      const u = await User.findById(req.userId).select("currentBalance createdAt");
      const cb = Number(u?.currentBalance) || 0;
      const createdAt = u?.createdAt ? new Date(u.createdAt) : new Date(0);
      const spent = await sumExpensesInPeriod(req.userId, createdAt, new Date());
      return {
        period: null, totalIncome: 0, recurringIncome: 0, oneTimeIncome: 0,
        totalBills: 0, totalExpenses: 0, totalPaymentPlans: 0,
        totalExpensesSpent: spent,
        savingsThisPeriod: 0, investmentsThisPeriod: 0,
        balance: cb - spent, components: null, currentBalance: cb, leftToSpend: cb - spent,
        nextPayDate: null, daysUntilNextPaycheck: null,
        nextPaycheckBalance: null, nextPeriod: null, sources: [],
        periodLabel: { start: null, end: null }, nextPayDateLabel: null, empty: true,
      };
    };

    const sources = await IncomeSource.find({ user: req.userId, isActive: true });
    if (!sources.length) return res.json(await buildEmptyResponse());

    // "Today" is pinned to America/Los_Angeles via resolveToday —
    // server clock (UTC on Vercel) is ignored. Client can override
    // with ?localDate=YYYY-MM-DD for testing.
    const today = resolveToday(req);
    const budget = getBudgetPeriod(sources, today);
    if (!budget) return res.json(await buildEmptyResponse());

    const { start, end, nextPayDate, sources: sourceBreakdown } = budget;

    // Prefetch bills + override map once and reuse across both
    // computeSpendable calls (current period + next-paycheck projection).
    const bills = await Bill.find({ user: req.userId, isActive: { $ne: false } });
    const overrideMap = await loadOverrideMap(req.userId, start, end);

    // Savings + investments — informational response fields, NOT part of
    // the spendable formula. Savings already mutate user.currentBalance
    // at transaction time so they show up via the seed; investments are
    // displayed but not counted as outflows.
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

    const userDoc = await User.findById(req.userId).select("currentBalance createdAt onboardingDate");
    const currentBalance = Number(userDoc?.currentBalance) || 0;
    const onboardingDate = userDoc?.onboardingDate || null;

    // ═══════════════════════════════════════════════════════════════
    // SPENDABLE BALANCE — source of truth.
    //
    // computeSpendable returns the cumulative-from-onboarding balance
    // over [onboardingDate, currentPeriod.end] plus a component
    // breakdown. Every dashboard surface (hero number, stat cards,
    // breakdown chips) reads from `result.spendable` and
    // `result.components.*`. The legacy per-period formula
    // (currentBalance + thisPeriodIncome − thisPeriodOutflows) silently
    // drifted past period 1 because currentBalance was never rolled
    // forward — see commit b950722 in this branch and the spec doc for
    // the full rationale.
    //
    // /year-to-date and /period-history continue to call
    // computePeriodBalance for per-period retrospectives — that
    // function is untouched.
    // ═══════════════════════════════════════════════════════════════
    const result = await computeSpendable({
      userId: req.userId,
      asOfDate: end,
      sources,
      currentBalance,
      onboardingDate,
      bills,
      overrideMap,
    });

    // Derive legacy-shape totals from the component breakdown so existing
    // client surfaces (dashboard stat cards, "spent this period" label,
    // etc.) keep working without a client-side change.
    const totalBills = result.components.unpaidBills + result.components.paidBills;
    const totalIncome = result.components.incomeRecurring + result.components.incomeOneTime;
    const totalExpenses = result.components.expenses;
    const totalPaymentPlans = result.components.unpaidPlans + result.components.paidPlans;

    // Days until next paycheck (LA-pinned via the resolveToday "today").
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

    // Previous-period boundaries + spent total. Used by the Expense
    // page "Last period" tab and the "spent less" celebration modal.
    // sumExpensesInPeriod here is the legacy per-period sum (not the
    // accountedFor-filtered one) — these surfaces are retrospective,
    // not balance-driving, so behavior is unchanged.
    let previousPeriod = null;
    let spentPreviousPeriod = null;
    const prevDate = new Date(start);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevBudget = getBudgetPeriod(sources, prevDate);
    if (prevBudget) {
      previousPeriod = { start: toDateString(prevBudget.start), end: toDateString(prevBudget.end) };
      spentPreviousPeriod = await sumExpensesInPeriod(req.userId, prevBudget.start, prevBudget.end);
    }

    // Next-paycheck projection — what the user will have on the day
    // their next paycheck lands. Same cumulative formula extended to
    // the next period's end.
    let nextPaycheckBalance = null;
    let nextPeriod = null;
    if (nextPayDate) {
      const nextBudget = getBudgetPeriod(sources, nextPayDate);
      if (nextBudget) {
        const nextOverrideMap = await loadOverrideMap(req.userId, nextBudget.start, nextBudget.end);
        const nextResult = await computeSpendable({
          userId: req.userId,
          asOfDate: nextBudget.end,
          sources,
          currentBalance,
          onboardingDate,
          bills,
          overrideMap: nextOverrideMap,
        });
        nextPaycheckBalance = nextResult.spendable;
        nextPeriod = {
          start: toDateString(nextBudget.start),
          end: toDateString(nextBudget.end),
          recurringIncome: nextResult.components.incomeRecurring,
          oneTimeIncome: nextResult.components.incomeOneTime,
          totalIncome: nextResult.components.incomeRecurring + nextResult.components.incomeOneTime,
          totalBills: nextResult.components.unpaidBills + nextResult.components.paidBills,
          totalExpenses: nextResult.components.expenses,
          totalPaymentPlans: nextResult.components.unpaidPlans + nextResult.components.paidPlans,
        };
      }
    }

    res.json({
      period: { start, end },
      previousPeriod,
      recurringIncome: result.components.incomeRecurring,
      oneTimeIncome: result.components.incomeOneTime,
      totalIncome,
      totalBills,
      totalExpenses,
      totalPaymentPlans,
      spentCurrentPeriod: totalExpenses,
      spentPreviousPeriod,
      savingsThisPeriod,
      totalSaved,
      investmentsThisPeriod,
      balance: result.spendable,
      // Full component breakdown for client-side debugging and future
      // dashboard surfaces. The dashboard hero reads `balance`; the
      // stat cards read these.
      components: result.components,
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
        { category: { $not: /^savings$/i } }, // Savings are transfers, never spending (case-insensitive)
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

    const userDoc = await User.findById(req.userId).select("createdAt currentBalance onboardingDate");
    const currentBalance = Number(userDoc?.currentBalance) || 0;
    const onboardingDate = userDoc?.onboardingDate || null;

    // Same LA-pinned "today" as /paycheck-current.
    const today = resolveToday(req);
    const currentPeriod = getBudgetPeriod(sources, today);
    if (!currentPeriod) {
      return res.status(400).json({ error: "Unable to compute current budget period." });
    }

    // Premium gate: future-period projections (any payday after the
    // current period's end) require an active subscription.
    if (startOfDay(targetDate) > startOfDay(currentPeriod.end) && !req.isPremium) {
      return res.status(403).json({
        error: "Future-period projections are a Premium feature.",
        upgradeRequired: true,
      });
    }

    // The pay period containing targetDate — drives per-period
    // breakdown fields the calendar day-sheet renders.
    const targetBudget = getBudgetPeriod(sources, targetDate);
    if (!targetBudget) {
      return res.status(400).json({ error: "Unable to compute target budget period." });
    }

    const bills = await Bill.find({ user: req.userId, isActive: { $ne: false } });
    const targetOverrideMap = await loadOverrideMap(req.userId, targetBudget.start, targetBudget.end);
    const targetPayments = await loadBillPayments(req.userId, targetBudget.start, targetBudget.end);
    const allPlansForProjection = await PaymentPlan.find({ userId: req.userId });
    const toYMDp = (d) => { const dt = new Date(d); return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate(); };

    // Plan installments scoped to the target period — paid → paidDate
    // bucket, unpaid → scheduled date bucket. Same bucketing the
    // dashboard uses so numbers tie out across surfaces.
    const sumPlansDue = (periodStart, periodEnd) => {
      const sYMD = toYMDp(periodStart);
      const eYMD = toYMDp(periodEnd);
      let total = 0;
      allPlansForProjection.forEach((plan) => {
        (plan.payments || []).forEach((pp) => {
          if (pp.paid) {
            const dp = pp.datePaid || pp.paidDate;
            if (!dp) return;
            const dpYMD = toYMDp(dp);
            if (dpYMD >= sYMD && dpYMD <= eYMD) total += Number(pp.amount) || 0;
            return;
          }
          const ymd = toYMDp(pp.date);
          if (ymd >= sYMD && ymd <= eYMD) total += Number(pp.amount) || 0;
        });
      });
      return total;
    };

    // ═══════════════════════════════════════════════════════════════
    // Headline balance: cumulative-from-onboarding through targetDate.
    // Same engine the dashboard hero uses — single source of truth.
    // ═══════════════════════════════════════════════════════════════
    const result = await computeSpendable({
      userId: req.userId,
      asOfDate: targetDate,
      sources,
      currentBalance,
      onboardingDate,
      bills,
    });

    // Rollover = cumulative spendable as of the day BEFORE the target
    // period begins. Shown as "Rollover from previous" / "Opening
    // balance" on the day sheet. computeSpendable returns the seed
    // when asOfDate is before onboardingDate (degenerate case for
    // first-period clicks), so this works for the onboarding period
    // too without a special branch.
    const dayBeforeTargetStart = new Date(targetBudget.start);
    dayBeforeTargetStart.setDate(dayBeforeTargetStart.getDate() - 1);
    const rolloverResult = await computeSpendable({
      userId: req.userId,
      asOfDate: dayBeforeTargetStart,
      sources,
      currentBalance,
      onboardingDate,
      bills,
    });
    const rollover = rolloverResult.spendable;

    // Per-period display fields. All scoped to [targetBudget.start,
    // targetBudget.end]; not part of the headline balance math but
    // used by the calendar day sheet's snapshot rows.
    const periodBills = sumBillsInPeriod(bills, targetBudget.start, targetBudget.end, targetOverrideMap, targetPayments);
    const periodExpenses = await sumExpensesInPeriod(req.userId, targetBudget.start, targetBudget.end, { excludeAccountedFor: true });
    const periodPlans = sumPlansDue(targetBudget.start, targetBudget.end);
    const paycheckAmount = targetBudget.totalIncome;

    // isFirstPeriod true when the user's createdAt falls within the
    // target period — drives the "Opening balance" vs "Rollover from
    // previous" label on the calendar day sheet.
    const isFirstPeriod = !!(
      userDoc?.createdAt &&
      new Date(userDoc.createdAt) >= startOfDay(targetBudget.start) &&
      new Date(userDoc.createdAt) <= startOfDay(targetBudget.end)
    );

    return res.json({
      paydayDate,
      paycheckAmount,
      rollover,
      totalAvailable: rollover + paycheckAmount,
      billsThisPeriod: periodBills,
      plansDueThisPeriod: periodPlans,
      expensesThisPeriod: periodExpenses,
      balance: result.spendable,
      // Full component breakdown for client-side debugging and parity
      // with /paycheck-current.
      components: result.components,
      periods: [{
        start: toDateString(targetBudget.start),
        end: toDateString(targetBudget.end),
        totalIncome: paycheckAmount,
        totalBills: periodBills,
        totalExpenses: periodExpenses,
        plansDue: periodPlans,
        rollover,
        balance: result.spendable,
      }],
      isFirstPeriod,
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
        { category: { $not: /^savings$/i } }, // YTD spending chart: savings are transfers, not spending (case-insensitive)
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
        { category: { $not: /^savings$/i } },
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
