const express = require("express");

const Bill = require("../models/Bill");
const { authRequired } = require("../middleware/auth");

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

module.exports = router;
