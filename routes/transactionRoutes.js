const express = require("express");

const Transaction = require("../models/Transaction");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/", authRequired, async (req, res) => {
  try {
    const { from, to } = req.query;
    const match = { user: req.userId };
    if (from || to) {
      match.date = {};
      if (from) match.date.$gte = new Date(from);
      if (to) match.date.$lte = new Date(to);
    }
    const transactions = await Transaction.find(match).sort({ date: 1 });
    res.json(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", authRequired, async (req, res) => {
  try {
    const { type, label, amount, date, paycheckIndex, category, platform, ruleId } = req.body || {};
    if (!type || !label || amount == null || !date) {
      return res.status(400).json({ error: "Type, label, amount, and date are required." });
    }

    const transaction = await Transaction.create({
      user: req.userId,
      type,
      label,
      amount,
      date,
      paycheckIndex,
      meta: {
        category,
        platform,
        ruleId: ruleId || null,
      },
    });
    res.status(201).json(transaction);
  } catch (error) {
    console.error("Error creating transaction:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/:id", authRequired, async (req, res) => {
  try {
    const { label, amount, date, category, platform } = req.body || {};
    const update = {};
    if (label !== undefined) update.label = label;
    if (amount !== undefined) update.amount = amount;
    if (date !== undefined) update.date = date;
    if (category !== undefined) update["meta.category"] = category;
    if (platform !== undefined) update["meta.platform"] = platform;
    const updated = await Transaction.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      update,
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ error: "Transaction not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating transaction:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", authRequired, async (req, res) => {
  try {
    const deleted = await Transaction.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!deleted) {
      return res.status(404).json({ error: "Transaction not found" });
    }
    res.json({ message: "Transaction deleted" });
  } catch (error) {
    console.error("Error deleting transaction:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
