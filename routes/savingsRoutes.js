const express = require("express");

const SavingsGoal = require("../models/SavingsGoal");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/", authRequired, async (req, res) => {
  try {
    const goals = await SavingsGoal.find({ userId: req.userId }).sort({ createdAt: 1 });
    res.json(goals);
  } catch (err) {
    console.error("Error fetching savings goals:", err);
    res.status(500).json({ message: "Failed to load savings goals." });
  }
});

router.post("/", authRequired, async (req, res) => {
  try {
    const { name, targetAmount, perPaycheckAmount, category } = req.body || {};
    if (!name || targetAmount == null) {
      return res.status(400).json({ message: "Name and target amount are required." });
    }
    const goal = await SavingsGoal.create({
      userId: req.userId,
      name,
      targetAmount: Number(targetAmount),
      perPaycheckAmount: Number(perPaycheckAmount) || 0,
      category: category || "Other",
      savedAmount: 0,
    });
    res.status(201).json(goal);
  } catch (err) {
    console.error("Error creating savings goal:", err);
    res.status(500).json({ message: "Failed to create savings goal." });
  }
});

router.patch("/:id", authRequired, async (req, res) => {
  try {
    const { name, targetAmount, perPaycheckAmount, category } = req.body || {};
    const goal = await SavingsGoal.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      {
        ...(name !== undefined ? { name } : {}),
        ...(targetAmount !== undefined ? { targetAmount: Number(targetAmount) } : {}),
        ...(perPaycheckAmount !== undefined ? { perPaycheckAmount: Number(perPaycheckAmount) } : {}),
        ...(category !== undefined ? { category } : {}),
      },
      { new: true }
    );
    if (!goal) return res.status(404).json({ message: "Goal not found." });
    res.json(goal);
  } catch (err) {
    console.error("Error updating savings goal:", err);
    res.status(500).json({ message: "Failed to update savings goal." });
  }
});

router.post("/:id/contribute", authRequired, async (req, res) => {
  try {
    const { amount } = req.body || {};
    const contribution = Number(amount);
    if (!contribution || contribution <= 0) {
      return res.status(400).json({ message: "Contribution amount must be greater than zero." });
    }
    const goal = await SavingsGoal.findOne({ _id: req.params.id, userId: req.userId });
    if (!goal) return res.status(404).json({ message: "Goal not found." });

    const newSaved = Math.min(goal.savedAmount + contribution, goal.targetAmount);
    goal.savedAmount = newSaved;
    await goal.save();
    res.json(goal);
  } catch (err) {
    console.error("Error contributing to savings goal:", err);
    res.status(500).json({ message: "Failed to add contribution." });
  }
});

router.delete("/:id", authRequired, async (req, res) => {
  try {
    const deleted = await SavingsGoal.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!deleted) return res.status(404).json({ message: "Goal not found." });
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting savings goal:", err);
    res.status(500).json({ message: "Failed to delete savings goal." });
  }
});

module.exports = router;
