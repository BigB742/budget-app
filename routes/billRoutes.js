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
    const { name, amount, category, lastPaymentDate, lastPaymentAmount } = req.body;
    const dueDayOfMonth = req.body?.dueDayOfMonth ?? req.body?.dueDay;
    if (!name || amount == null || !dueDayOfMonth) {
      return res.status(400).json({ error: "Name, amount, and due day of month are required." });
    }
    const bill = await Bill.create({
      user: req.userId,
      name,
      amount,
      dueDayOfMonth,
      category,
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
    const { name, amount, category, isActive, lastPaymentDate, lastPaymentAmount } =
      req.body || {};
    const dueDayOfMonth = req.body?.dueDayOfMonth ?? req.body?.dueDay;
    const update = {};
    if (name !== undefined) update.name = name;
    if (amount !== undefined) update.amount = amount;
    if (dueDayOfMonth !== undefined) update.dueDayOfMonth = dueDayOfMonth;
    if (category !== undefined) update.category = category;
    if (isActive !== undefined) update.isActive = isActive;
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
