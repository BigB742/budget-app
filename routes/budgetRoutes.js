const express = require("express");
const BudgetItem = require("../models/BudgetItem");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/", authRequired, async (req, res) => {
  try {
    const items = await BudgetItem.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json(items);
  } catch (error) {
    console.error("Error fetching budget items:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", authRequired, async (req, res) => {
  try {
    const { amount, category, date, note } = req.body;
    const budgetItem = new BudgetItem({
      userId: req.userId,
      amount,
      category,
      date: date || Date.now(),
      note,
    });
    const savedItem = await budgetItem.save();
    res.status(201).json(savedItem);
  } catch (error) {
    console.error("Error creating budget item:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", authRequired, async (req, res) => {
  try {
    const deleted = await BudgetItem.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!deleted) {
      return res.status(404).json({ error: "Item not found" });
    }
    res.json({ message: "Item deleted" });
  } catch (error) {
    console.error("Error deleting budget item:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
