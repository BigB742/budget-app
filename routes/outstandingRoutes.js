// GET /api/outstanding — unpaid items due today or in the past across
// bills, plans, and expenses. Drives the login pop-up queue (§6.5).
//
// Filter rules per §6.3:
//   - bills:     paid state from BillPayment collection (no BillPayment
//                for this month's dueDate AND dueDate <= today)
//   - plans:     payment subdoc.paid === false AND payment.date <= today
//   - expenses:  expense.paid === false AND date <= today
// Results are returned unsorted; the client sorts by date + type per
// §6.5.

const express = require("express");

const Bill = require("../models/Bill");
const BillPayment = require("../models/BillPayment");
const Expense = require("../models/Expense");
const PaymentPlan = require("../models/PaymentPlan");
const User = require("../models/User");
const { authRequired } = require("../middleware/auth");
const { todayLocal, toDateOnly, isAfter } = require("../utils/date");
const { startOfDayInAppTz } = require("../utils/appTz");
const { toLocalDate } = require("../utils/paycheckUtils");

const router = express.Router();

// Build a YMD integer key for fast compare without tz quirks.
const toYMD = (d) => {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.getUTCFullYear() * 10000 + (dt.getUTCMonth() + 1) * 100 + dt.getUTCDate();
};

router.get("/", authRequired, async (req, res) => {
  try {
    // PayPulse only tracks activity from User.onboardingDate forward.
    // Bills, plan installments, and expenses dated before that anchor
    // are outside the user's awareness — they shouldn't be surfaced in
    // the "Did you pay this?" queue. Users with onboardingDate=null
    // (legacy / pre-backfill) get an empty queue until the backfill
    // runs; we have no defined tracking window for them.
    const userDoc = await User.findById(req.userId).select("onboardingDate");
    const onboardingDate = userDoc?.onboardingDate || null;
    if (!onboardingDate) {
      return res.json({ bills: [], plans: [], expenses: [] });
    }
    const onboardLA = startOfDayInAppTz(onboardingDate);

    const now = new Date();
    const todayYMD = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

    const [bills, billPayments, plans, expenses] = await Promise.all([
      Bill.find({ user: req.userId, isActive: { $ne: false } }),
      (async () => {
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
        return BillPayment.find({
          user: req.userId,
          dueDate: { $gte: yearStart, $lt: yearEnd },
        });
      })(),
      PaymentPlan.find({ userId: req.userId }),
      Expense.find({
        $or: [{ user: req.userId }, { userId: req.userId }],
        paid: false,
        date: { $lte: todayLocal() },
      }),
    ]);

    // Bills: look at this month's due date only.
    const paidBillKeys = new Set();
    (billPayments || []).forEach((bp) => {
      if (!bp.dueDate) return;
      paidBillKeys.add(`${bp.bill}_${toYMD(bp.dueDate)}`);
    });

    const outstandingBills = [];
    (bills || []).forEach((b) => {
      const day = b.dueDayOfMonth || b.dueDay;
      if (!day) return;
      const thisMonthDue = new Date(now.getFullYear(), now.getMonth(), day);
      const dueYMD = toYMD(thisMonthDue);
      if (dueYMD > todayYMD) return;
      // Pre-onboarding occurrences are invisible to the user — skip.
      const occLA = startOfDayInAppTz(thisMonthDue);
      if (!occLA || (onboardLA && occLA < onboardLA)) return;
      // Respect startDate / lastPaymentDate gates so inactive periods
      // don't appear in the queue.
      if (b.startDate) {
        const sd = new Date(b.startDate);
        const sdLocal = new Date(sd.getUTCFullYear(), sd.getUTCMonth(), sd.getUTCDate());
        if (thisMonthDue < sdLocal) return;
      }
      if (b.lastPaymentDate) {
        const lp = new Date(b.lastPaymentDate);
        const lpLocal = new Date(lp.getUTCFullYear(), lp.getUTCMonth(), lp.getUTCDate());
        if (thisMonthDue > lpLocal) return;
      }
      if (paidBillKeys.has(`${b._id}_${dueYMD}`)) return;
      outstandingBills.push({
        id: String(b._id),
        name: b.name,
        amount: b.amount,
        dueDate: toDateOnly(thisMonthDue),
        paid: false,
      });
    });

    // Plans: flatten unpaid payments due today-or-earlier, but no
    // earlier than onboardingDate. Plan-installment dates are stored
    // as Mongo Date instances (sometimes UTC midnight, sometimes LA
    // noon depending on the writer); pipe through toLocalDate +
    // startOfDayInAppTz to mirror computeSpendable's plan-side reads.
    const outstandingPlans = [];
    (plans || []).forEach((plan) => {
      (plan.payments || []).forEach((p) => {
        if (p.paid) return;
        if (!p.date) return;
        if (toYMD(p.date) > todayYMD) return;
        const dLA = startOfDayInAppTz(toLocalDate(p.date));
        if (!dLA || (onboardLA && dLA < onboardLA)) return;
        outstandingPlans.push({
          id: `${plan._id}:${p.id}`,
          planId: String(plan._id),
          paymentId: p.id,
          planName: plan.name,
          amount: p.amount,
          dueDate: toDateOnly(p.date),
          paid: false,
        });
      });
    });

    const outstandingExpenses = (expenses || [])
      .filter((e) => {
        const eLA = startOfDayInAppTz(toLocalDate(e.date));
        return eLA && (!onboardLA || eLA >= onboardLA);
      })
      .map((e) => ({
        id: String(e._id),
        name: e.description || e.category || "Expense",
        amount: e.amount,
        date: toDateOnly(e.date),
        paid: false,
      }));

    res.json({
      bills: outstandingBills,
      plans: outstandingPlans,
      expenses: outstandingExpenses,
    });
  } catch (err) {
    console.error("Error fetching outstanding:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
// Suppress unused-param lint: isAfter re-exported from utils/date; kept
// imported so this route stays consistent with the rest of the codebase.
// eslint-disable-next-line no-unused-expressions
isAfter;
