const express = require("express");

const BillPayment = require("../models/BillPayment");
const { authRequired } = require("../middleware/auth");
const { markBillPaid, unmarkBillPayment } = require("../utils/billPaymentService");

const router = express.Router();

// GET — all bill payments for user, optionally filtered by dueDate range
router.get("/", authRequired, async (req, res) => {
  try {
    const query = { user: req.userId };
    if (req.query.from || req.query.to) {
      query.dueDate = {};
      if (req.query.from) query.dueDate.$gte = new Date(req.query.from);
      if (req.query.to) query.dueDate.$lte = new Date(req.query.to);
    }
    const payments = await BillPayment.find(query).sort({ dueDate: -1 });
    res.json(payments);
  } catch (error) {
    console.error("Error fetching bill payments:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST — create or update a bill payment (mark as paid). Thin wrapper
// over utils/billPaymentService — see that file for the paidEarly
// routing + auto-expense details. Preserved as-is for backwards compat.
router.post("/", authRequired, async (req, res) => {
  try {
    const payment = await markBillPaid(req.userId, req.body);
    res.json(payment);
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error("Error saving bill payment:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE — remove a bill payment by ID (must belong to user).
router.delete("/:id", authRequired, async (req, res) => {
  try {
    const deleted = await unmarkBillPayment(req.userId, { billPaymentId: req.params.id });
    if (!deleted) return res.status(404).json({ error: "Bill payment not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting bill payment:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
