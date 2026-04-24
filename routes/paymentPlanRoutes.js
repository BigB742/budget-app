const express = require("express");
const PaymentPlan = require("../models/PaymentPlan");
const { authRequired } = require("../middleware/auth");
const { parseDateOnlyNoon, todayLocal } = require("../utils/date");

const router = express.Router();

// Backwards-compat shims so the rest of this file's call sites don't
// have to churn. Both delegate to the single utils/date.js source.
const parseLocalDate = parseDateOnlyNoon;
const todayLocalStart = todayLocal;

// GET / — all plans for the authenticated user
router.get("/", authRequired, async (req, res) => {
  try {
    const plans = await PaymentPlan.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json(plans);
  } catch (err) {
    console.error("Error fetching payment plans:", err.message);
    res.status(500).json({ message: "Failed to load payment plans." });
  }
});

// POST / — create a new plan
router.post("/", authRequired, async (req, res) => {
  try {
    const { name, totalAmount, payments } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Plan name is required." });
    }
    if (!Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ message: "At least one payment entry is required." });
    }
    for (const p of payments) {
      if (!p.date || !Number.isFinite(Number(p.amount)) || Number(p.amount) <= 0) {
        return res.status(400).json({ message: "Every payment needs a valid date and positive amount." });
      }
    }

    const todayStart = todayLocalStart();
    const plan = await PaymentPlan.create({
      userId: req.userId,
      name: name.trim(),
      totalAmount: totalAmount != null ? Number(totalAmount) : undefined,
      payments: payments.map((p) => {
        const d = parseLocalDate(p.date);
        const isPast = d && d < todayStart;
        return {
          date: d,
          amount: Number(p.amount),
          paid: isPast,
          paidDate: isPast ? new Date() : undefined,
        };
      }),
    });
    res.status(201).json(plan);
  } catch (err) {
    console.error("Error creating payment plan:", err.message);
    res.status(500).json({ message: "Failed to create payment plan." });
  }
});

// PUT /:id — update plan (name, totalAmount, add/remove/update payments)
router.put("/:id", authRequired, async (req, res) => {
  try {
    const plan = await PaymentPlan.findOne({ _id: req.params.id, userId: req.userId });
    if (!plan) return res.status(404).json({ message: "Plan not found." });

    const { name, totalAmount, payments } = req.body;
    if (name !== undefined) plan.name = String(name).trim() || plan.name;
    if (totalAmount !== undefined) plan.totalAmount = Number(totalAmount) || null;
    if (Array.isArray(payments)) {
      // Paid entries cannot be deleted — keep any paid entries from the
      // existing list that the caller omitted. Unpaid entries are fully
      // replaceable (the caller sends the new list of unpaid entries).
      const existingPaid = plan.payments.filter((p) => p.paid);
      const ts = todayLocalStart();
      const newUnpaid = payments
        .filter((p) => !p.paid)
        .map((p) => {
          const d = parseLocalDate(p.date);
          const isPast = d && d < ts;
          return {
            id: p.id || undefined,
            date: d,
            amount: Number(p.amount),
            paid: isPast,
            paidDate: isPast ? new Date() : undefined,
          };
        });
      plan.payments = [...existingPaid, ...newUnpaid];
    }
    await plan.save();
    res.json(plan);
  } catch (err) {
    console.error("Error updating payment plan:", err.message);
    res.status(500).json({ message: "Failed to update payment plan." });
  }
});

// DELETE /:id — delete entire plan
router.delete("/:id", authRequired, async (req, res) => {
  try {
    const deleted = await PaymentPlan.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!deleted) return res.status(404).json({ message: "Plan not found." });
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting payment plan:", err.message);
    res.status(500).json({ message: "Failed to delete payment plan." });
  }
});

// Shared toggle logic — used by both
//   PATCH /:id/payments/:paymentId         (legacy path)
//   PATCH /:id/payments/:paymentId/paid    (§6 canonical path)
// so the paidEarly routing lives in exactly one place.
async function togglePaymentPaid(userId, planId, paymentId, paid) {
  const plan = await PaymentPlan.findOne({ _id: planId, userId });
  if (!plan) { const e = new Error("Plan not found."); e.status = 404; throw e; }
  const entry = plan.payments.find((p) => p.id === paymentId);
  if (!entry) { const e = new Error("Payment entry not found."); e.status = 404; throw e; }

  if (paid === false) {
    entry.paid = false;
    entry.datePaid = undefined;
    entry.paidDate = undefined;
    entry.paidEarly = false;
  } else {
    const today = new Date();
    const todayYMD = today.getUTCFullYear() * 10000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate();
    const scheduledDate = new Date(entry.date);
    const scheduledYMD = scheduledDate.getUTCFullYear() * 10000 + (scheduledDate.getUTCMonth() + 1) * 100 + scheduledDate.getUTCDate();
    entry.paid = true;
    entry.datePaid = today;
    entry.paidDate = today;
    entry.paidEarly = todayYMD < scheduledYMD;
  }
  await plan.save();
  return plan;
}

// PATCH /:id/payments/:paymentId — legacy toggle (defaults to "mark
// paid" when body.paid is absent; kept for existing callers).
router.patch("/:id/payments/:paymentId", authRequired, async (req, res) => {
  try {
    const paid = req.body?.paid === false ? false : true;
    const plan = await togglePaymentPaid(req.userId, req.params.id, req.params.paymentId, paid);
    res.json(plan);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error("Error updating payment status:", err.message);
    res.status(500).json({ message: "Failed to update payment status." });
  }
});

// PATCH /:id/payments/:paymentId/paid — §6 canonical path. Explicit
// { paid: boolean } contract. Delegates to the same helper so paidEarly
// is computed identically.
router.patch("/:id/payments/:paymentId/paid", authRequired, async (req, res) => {
  try {
    const { paid } = req.body || {};
    if (typeof paid !== "boolean") {
      return res.status(400).json({ message: "paid (boolean) is required." });
    }
    const plan = await togglePaymentPaid(req.userId, req.params.id, req.params.paymentId, paid);
    res.json(plan);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error("Error updating payment status:", err.message);
    res.status(500).json({ message: "Failed to update payment status." });
  }
});

module.exports = router;
