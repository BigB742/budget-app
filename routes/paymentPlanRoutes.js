const express = require("express");
const PaymentPlan = require("../models/PaymentPlan");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

// Parse a YYYY-MM-DD string as LOCAL noon so it never shifts day when
// stored as UTC. Using noon instead of midnight gives a 12-hour buffer
// in any timezone worldwide.
function parseLocalDate(str) {
  if (!str) return null;
  const [y, m, d] = String(str).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0);
}

function todayLocalStart() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

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

// PATCH /:id/payments/:paymentId — toggle paid status
router.patch("/:id/payments/:paymentId", authRequired, async (req, res) => {
  try {
    const plan = await PaymentPlan.findOne({ _id: req.params.id, userId: req.userId });
    if (!plan) return res.status(404).json({ message: "Plan not found." });

    const entry = plan.payments.find((p) => p.id === req.params.paymentId);
    if (!entry) return res.status(404).json({ message: "Payment entry not found." });

    // Support explicit paid: false to fully unmark — restores the
    // installment to its originally scheduled pay period (via its
    // unchanged `date` field) and clears all paid metadata.
    if (req.body?.paid === false) {
      entry.paid = false;
      entry.datePaid = undefined;
      entry.paidDate = undefined;
      entry.paidEarly = false;
    } else {
      // Mark paid: datePaid = today. paidEarly = true if today is
      // strictly before the scheduled date (paid ahead of schedule).
      const today = new Date();
      const todayYMD = today.getUTCFullYear() * 10000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate();
      const scheduledDate = new Date(entry.date);
      const scheduledYMD = scheduledDate.getUTCFullYear() * 10000 + (scheduledDate.getUTCMonth() + 1) * 100 + scheduledDate.getUTCDate();
      entry.paid = true;
      entry.datePaid = today;
      entry.paidDate = today; // legacy mirror
      entry.paidEarly = todayYMD < scheduledYMD;
    }
    await plan.save();
    res.json(plan);
  } catch (err) {
    console.error("Error updating payment status:", err.message);
    res.status(500).json({ message: "Failed to update payment status." });
  }
});

module.exports = router;
