const express = require("express");

const SavingsGoal = require("../models/SavingsGoal");
const User = require("../models/User");
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
    const { name, targetAmount, perPaycheckAmount, category, savedAmount } = req.body || {};

    if (typeof name !== "string" || !name.trim() || name.length > 100) {
      return res.status(400).json({ message: "Name is required (max 100 characters)." });
    }
    const target = Number(targetAmount);
    if (!Number.isFinite(target) || target < 0 || target > 100_000_000) {
      return res.status(400).json({ message: "Target amount must be a positive number." });
    }

    if (req.subscriptionStatus === "free") {
      const goalCount = await SavingsGoal.countDocuments({ userId: req.userId });
      if (goalCount >= 3) {
        return res.status(403).json({ message: "Free accounts are limited to 3 savings goals. Upgrade to Premium for unlimited savings goals." });
      }
    }

    const goal = await SavingsGoal.create({
      userId: req.userId,
      name: name.trim(),
      targetAmount: target,
      perPaycheckAmount: Math.max(0, Number(perPaycheckAmount) || 0),
      category: typeof category === "string" ? category : "Other",
      savedAmount: Math.max(0, Number(savedAmount) || 0),
    });
    res.status(201).json(goal);
  } catch (err) {
    console.error("Error creating savings goal:", err);
    res.status(500).json({ message: "Failed to create savings goal." });
  }
});

router.patch("/:id", authRequired, async (req, res) => {
  try {
    const { name, targetAmount, perPaycheckAmount, category, autopilotEnabled, savedAmount } = req.body || {};
    const goal = await SavingsGoal.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      {
        ...(name !== undefined ? { name } : {}),
        ...(targetAmount !== undefined ? { targetAmount: Number(targetAmount) } : {}),
        ...(perPaycheckAmount !== undefined ? { perPaycheckAmount: Number(perPaycheckAmount) } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(autopilotEnabled !== undefined ? { autopilotEnabled } : {}),
        ...(savedAmount !== undefined ? { savedAmount: Number(savedAmount) } : {}),
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
    const actualContribution = newSaved - goal.savedAmount;
    goal.savedAmount = newSaved;
    await goal.save();
    // Deduct from user's spendable balance
    await User.findByIdAndUpdate(req.userId, { $inc: { currentBalance: -actualContribution } });
    res.json(goal);
  } catch (err) {
    console.error("Error contributing to savings goal:", err);
    res.status(500).json({ message: "Failed to add contribution." });
  }
});

router.post("/:id/withdraw", authRequired, async (req, res) => {
  try {
    const { amount } = req.body || {};
    const withdrawal = Number(amount);
    if (!withdrawal || withdrawal <= 0) {
      return res.status(400).json({ message: "Withdrawal amount must be greater than zero." });
    }
    const goal = await SavingsGoal.findOne({ _id: req.params.id, userId: req.userId });
    if (!goal) return res.status(404).json({ message: "Goal not found." });
    if (withdrawal > goal.savedAmount) {
      return res.status(400).json({ message: "Cannot withdraw more than current savings balance." });
    }
    goal.savedAmount -= withdrawal;
    await goal.save();
    // Return to user's spendable balance
    await User.findByIdAndUpdate(req.userId, { $inc: { currentBalance: withdrawal } });
    res.json(goal);
  } catch (err) {
    console.error("Error withdrawing from savings goal:", err);
    res.status(500).json({ message: "Failed to withdraw." });
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
