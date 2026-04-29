const express = require("express");

const Bill = require("../models/Bill");
const BillPayment = require("../models/BillPayment");
const { authRequired } = require("../middleware/auth");
const { markBillPaid, unmarkBillPayment } = require("../utils/billPaymentService");
const { toDateOnly } = require("../utils/date");

const router = express.Router();

router.get("/", authRequired, async (req, res) => {
  try {
    const bills = await Bill.find({
      user: req.userId,
      isActive: { $ne: false },
    }).sort({ dueDayOfMonth: 1 });
    const mapped = bills.map((bill) => {
      const json = bill.toObject();
      return { ...json, dueDay: json.dueDayOfMonth };
    });
    res.json(mapped);
  } catch (error) {
    console.error("Error fetching bills:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", authRequired, async (req, res) => {
  try {
    const { name, amount, category, startDate, lastPaymentDate, lastPaymentAmount } = req.body;
    const dueDayOfMonth = req.body?.dueDayOfMonth ?? req.body?.dueDay;

    if (typeof name !== "string" || !name.trim() || name.length > 100) {
      return res.status(400).json({ error: "Name is required (max 100 characters)." });
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0 || numericAmount > 1_000_000) {
      return res.status(400).json({ error: "Amount must be a positive number." });
    }
    const day = Number(dueDayOfMonth);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return res.status(400).json({ error: "Due day must be an integer between 1 and 31." });
    }

    if (req.subscriptionStatus === "free") {
      const billCount = await Bill.countDocuments({ user: req.userId, isActive: { $ne: false } });
      if (billCount >= 5) {
        return res.status(403).json({ message: "Free accounts are limited to 5 bills. Upgrade to Premium for unlimited bills." });
      }
    }

    const bill = await Bill.create({
      user: req.userId,
      name: name.trim(),
      amount: numericAmount,
      dueDayOfMonth: day,
      category: typeof category === "string" ? category : undefined,
      startDate: startDate ? new Date(startDate + "T12:00:00") : null,
      lastPaymentDate: lastPaymentDate || null,
      lastPaymentAmount: lastPaymentAmount != null ? Number(lastPaymentAmount) : null,
    });
    const json = bill.toObject();
    res.status(201).json({ ...json, dueDay: json.dueDayOfMonth });
  } catch (error) {
    console.error("Error creating bill:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/:id", authRequired, async (req, res) => {
  try {
    const { name, amount, category, isActive, startDate, lastPaymentDate, lastPaymentAmount } =
      req.body || {};
    const dueDayOfMonth = req.body?.dueDayOfMonth ?? req.body?.dueDay;
    const update = {};
    if (name !== undefined) update.name = name;
    if (amount !== undefined) update.amount = amount;
    if (dueDayOfMonth !== undefined) update.dueDayOfMonth = dueDayOfMonth;
    if (category !== undefined) update.category = category;
    if (isActive !== undefined) update.isActive = isActive;
    if (startDate !== undefined) update.startDate = startDate ? new Date(startDate + "T12:00:00") : null;
    if (lastPaymentDate !== undefined) update.lastPaymentDate = lastPaymentDate || null;
    if (lastPaymentAmount !== undefined)
      update.lastPaymentAmount = lastPaymentAmount != null ? Number(lastPaymentAmount) : null;

    const updatedBill = await Bill.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      update,
      { new: true }
    );

    if (!updatedBill) {
      return res.status(404).json({ error: "Bill not found" });
    }

    const json = updatedBill.toObject();
    res.json({ ...json, dueDay: json.dueDayOfMonth });
  } catch (error) {
    console.error("Error updating bill:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", authRequired, async (req, res) => {
  try {
    const deletedBill = await Bill.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { isActive: false },
      { new: true }
    );

    if (!deletedBill) {
      return res.status(404).json({ error: "Bill not found" });
    }

    res.json({ message: "Bill deactivated" });
  } catch (error) {
    console.error("Error deleting bill:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /:id/paid — toggle paid state for a specific due date. Delegates
// to the same code path as POST /api/bill-payments + DELETE
// /api/bill-payments/:id, so the paidEarly routing + auto-expense +
// cascade-delete all run identically. Callers pass
// { paid: boolean, dueDate?: "YYYY-MM-DD", paidDate?: "YYYY-MM-DD",
//   paidAmount?: number }. Missing dueDate defaults to this month's
// dueDayOfMonth; missing paidDate defaults to today; missing paidAmount
// defaults to the bill's current amount.
router.patch("/:id/paid", authRequired, async (req, res) => {
  try {
    const { paid, dueDate, paidDate, paidAmount, note, accountedFor } = req.body || {};
    if (typeof paid !== "boolean") {
      return res.status(400).json({ error: "paid (boolean) is required." });
    }
    const bill = await Bill.findOne({ _id: req.params.id, user: req.userId });
    if (!bill) return res.status(404).json({ error: "Bill not found." });

    // Resolve due-date. If the caller didn't supply one, use this
    // month's scheduled dueDayOfMonth.
    let resolvedDueDate = dueDate;
    if (!resolvedDueDate) {
      const now = new Date();
      const day = bill.dueDayOfMonth || bill.dueDay;
      if (!day) return res.status(400).json({ error: "Bill has no dueDayOfMonth; dueDate must be supplied." });
      resolvedDueDate = toDateOnly(new Date(now.getFullYear(), now.getMonth(), day));
    }

    if (paid) {
      const payment = await markBillPaid(req.userId, {
        billId: bill._id,
        dueDate: resolvedDueDate,
        paidDate: paidDate || toDateOnly(new Date()),
        paidAmount: paidAmount != null ? Number(paidAmount) : Number(bill.amount),
        note,
        accountedFor: accountedFor === true,
      });
      return res.json({ success: true, payment });
    }

    const deleted = await unmarkBillPayment(req.userId, {
      billId: bill._id,
      dueDate: resolvedDueDate,
    });
    if (!deleted) {
      // Nothing was paid — success-noop.
      return res.json({ success: true, noop: true });
    }
    res.json({ success: true });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error("Error toggling bill paid:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
