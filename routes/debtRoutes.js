const express = require("express");

const Debt = require("../models/Debt");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

/**
 * Compute an estimated payoff date for a debt.
 * If interestRate > 0, use amortization formula to find number of months.
 * Otherwise, simply divide currentBalance by minimumPayment.
 */
function computeEstimatedPayoffDate(debt) {
  const { currentBalance, minimumPayment, interestRate } = debt;

  if (currentBalance <= 0 || minimumPayment <= 0) return null;

  let months;

  if (interestRate > 0) {
    // Monthly interest rate
    const r = interestRate / 100 / 12;
    // Amortization: n = -ln(1 - r * B / P) / ln(1 + r)
    const inner = 1 - (r * currentBalance) / minimumPayment;
    if (inner <= 0) {
      // Payment doesn't cover interest — debt will never be paid off
      return null;
    }
    months = -Math.log(inner) / Math.log(1 + r);
  } else {
    months = currentBalance / minimumPayment;
  }

  months = Math.ceil(months);
  const payoffDate = new Date();
  payoffDate.setMonth(payoffDate.getMonth() + months);
  return payoffDate.toISOString();
}

function debtWithPayoff(debt) {
  const obj = debt.toObject ? debt.toObject() : { ...debt };
  obj.estimatedPayoffDate = computeEstimatedPayoffDate(obj);
  return obj;
}

// GET / — all active debts for user, sorted by dueDayOfMonth
router.get("/", authRequired, async (req, res) => {
  try {
    const debts = await Debt.find({ userId: req.userId, isActive: true }).sort({ dueDayOfMonth: 1 });
    res.json(debts.map(debtWithPayoff));
  } catch (err) {
    console.error("Error fetching debts:", err);
    res.status(500).json({ message: "Failed to load debts." });
  }
});

// POST / — create a new debt
router.post("/", authRequired, async (req, res) => {
  try {
    const { name, originalBalance, currentBalance, interestRate, minimumPayment, dueDayOfMonth } = req.body || {};
    if (!name || originalBalance == null || currentBalance == null || minimumPayment == null || dueDayOfMonth == null) {
      return res.status(400).json({ message: "Name, originalBalance, currentBalance, minimumPayment, and dueDayOfMonth are required." });
    }
    const debt = await Debt.create({
      userId: req.userId,
      name,
      originalBalance: Number(originalBalance),
      currentBalance: Number(currentBalance),
      interestRate: Number(interestRate) || 0,
      minimumPayment: Number(minimumPayment),
      dueDayOfMonth: Number(dueDayOfMonth),
    });
    res.status(201).json(debtWithPayoff(debt));
  } catch (err) {
    console.error("Error creating debt:", err);
    res.status(500).json({ message: "Failed to create debt." });
  }
});

// PUT /:id — update debt fields
router.put("/:id", authRequired, async (req, res) => {
  try {
    const { name, originalBalance, currentBalance, interestRate, minimumPayment, dueDayOfMonth } = req.body || {};
    const debt = await Debt.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      {
        ...(name !== undefined ? { name } : {}),
        ...(originalBalance !== undefined ? { originalBalance: Number(originalBalance) } : {}),
        ...(currentBalance !== undefined ? { currentBalance: Number(currentBalance) } : {}),
        ...(interestRate !== undefined ? { interestRate: Number(interestRate) } : {}),
        ...(minimumPayment !== undefined ? { minimumPayment: Number(minimumPayment) } : {}),
        ...(dueDayOfMonth !== undefined ? { dueDayOfMonth: Number(dueDayOfMonth) } : {}),
      },
      { new: true }
    );
    if (!debt) return res.status(404).json({ message: "Debt not found." });
    res.json(debtWithPayoff(debt));
  } catch (err) {
    console.error("Error updating debt:", err);
    res.status(500).json({ message: "Failed to update debt." });
  }
});

// POST /:id/payment — record a payment, decrement currentBalance
router.post("/:id/payment", authRequired, async (req, res) => {
  try {
    const { amount, note } = req.body || {};
    const paymentAmount = Number(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      return res.status(400).json({ message: "Payment amount must be greater than zero." });
    }
    const debt = await Debt.findOne({ _id: req.params.id, userId: req.userId });
    if (!debt) return res.status(404).json({ message: "Debt not found." });

    debt.payments.push({ amount: paymentAmount, note: note || "" });
    debt.currentBalance = Math.max(0, debt.currentBalance - paymentAmount);

    if (debt.currentBalance <= 0) {
      debt.isActive = false;
    }

    await debt.save();
    res.json(debtWithPayoff(debt));
  } catch (err) {
    console.error("Error recording payment:", err);
    res.status(500).json({ message: "Failed to record payment." });
  }
});

// DELETE /:id — soft delete (set isActive = false)
router.delete("/:id", authRequired, async (req, res) => {
  try {
    const debt = await Debt.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      { isActive: false },
      { new: true }
    );
    if (!debt) return res.status(404).json({ message: "Debt not found." });
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting debt:", err);
    res.status(500).json({ message: "Failed to delete debt." });
  }
});

module.exports = router;
