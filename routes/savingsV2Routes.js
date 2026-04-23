// Savings v2 — new API surface that matches the redesigned Savings page.
// Mounted at /api/savings. Writes SavingsTransaction records so the
// Calendar can render per-day savings activity, and mutates
// user.currentBalance inline on deposit/withdraw (matches the existing
// spendable-balance contract used elsewhere in the app).

const express = require("express");
const SavingsGoal = require("../models/SavingsGoal");
const SavingsTransaction = require("../models/SavingsTransaction");
const User = require("../models/User");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

const serializeGoal = (g) => ({
  _id: g._id,
  name: g.name,
  currentBalance: g.currentBalance ?? g.savedAmount ?? 0,
  targetAmount: g.targetAmount === undefined ? null : g.targetAmount,
  isOnboardingGoal: !!g.isOnboardingGoal,
  createdAt: g.createdAt,
  updatedAt: g.updatedAt,
});

// GET /goals — list goals for current user, oldest first
router.get("/goals", authRequired, async (req, res) => {
  try {
    const goals = await SavingsGoal.find({ userId: req.userId }).sort({ createdAt: 1 });
    res.json(goals.map(serializeGoal));
  } catch (err) {
    console.error("[savings/goals] list error:", err.message);
    res.status(500).json({ message: "Failed to load savings goals." });
  }
});

// POST /goals — create a new goal
router.post("/goals", authRequired, async (req, res) => {
  try {
    const { name, targetAmount, isOnboardingGoal } = req.body || {};
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Name is required." });
    }
    const trimmed = name.trim().slice(0, 50);
    const target = targetAmount === null || targetAmount === undefined || targetAmount === ""
      ? null
      : Number(targetAmount);
    if (target !== null && (!Number.isFinite(target) || target < 0)) {
      return res.status(400).json({ message: "Target amount must be a positive number or empty." });
    }

    // Free tier limit — 3 goals
    if (req.subscriptionStatus === "free") {
      const goalCount = await SavingsGoal.countDocuments({ userId: req.userId });
      if (goalCount >= 3) {
        return res.status(403).json({
          message: "Free accounts are limited to 3 savings goals. Upgrade to Premium for unlimited.",
        });
      }
    }

    const goal = await SavingsGoal.create({
      userId: req.userId,
      name: trimmed,
      currentBalance: 0,
      savedAmount: 0,
      targetAmount: target,
      isOnboardingGoal: !!isOnboardingGoal,
    });
    res.status(201).json(serializeGoal(goal));
  } catch (err) {
    console.error("[savings/goals] create error:", err.message);
    res.status(500).json({ message: "Failed to create savings goal." });
  }
});

// PATCH /goals/:id — update name and/or targetAmount
router.patch("/goals/:id", authRequired, async (req, res) => {
  try {
    const goal = await SavingsGoal.findOne({ _id: req.params.id, userId: req.userId });
    if (!goal) return res.status(404).json({ message: "Goal not found." });

    const { name, targetAmount } = req.body || {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Name cannot be empty." });
      }
      goal.name = name.trim().slice(0, 50);
    }
    if (targetAmount !== undefined) {
      if (targetAmount === null || targetAmount === "") {
        goal.targetAmount = null;
      } else {
        const n = Number(targetAmount);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({ message: "Target amount must be a positive number." });
        }
        goal.targetAmount = n;
      }
    }
    await goal.save();
    res.json(serializeGoal(goal));
  } catch (err) {
    console.error("[savings/goals] patch error:", err.message);
    res.status(500).json({ message: "Failed to update goal." });
  }
});

// DELETE /goals/:id?withdraw=true|false
router.delete("/goals/:id", authRequired, async (req, res) => {
  try {
    const goal = await SavingsGoal.findOne({ _id: req.params.id, userId: req.userId });
    if (!goal) return res.status(404).json({ message: "Goal not found." });

    const withdraw = req.query.withdraw === "true" || req.query.withdraw === "1";
    const balance = goal.currentBalance || goal.savedAmount || 0;

    if (withdraw && balance > 0) {
      // Return balance to spendable
      await User.findByIdAndUpdate(req.userId, { $inc: { currentBalance: balance } });
      await SavingsTransaction.create({
        goalId: goal._id,
        userId: req.userId,
        type: "withdrawal",
        amount: balance,
        date: new Date(),
        goalNameSnapshot: goal.name,
      });
    }
    // Either way, remove the goal and its transactions
    await SavingsTransaction.deleteMany({ goalId: goal._id, userId: req.userId });
    await SavingsGoal.deleteOne({ _id: goal._id });
    res.json({ success: true });
  } catch (err) {
    console.error("[savings/goals] delete error:", err.message);
    res.status(500).json({ message: "Failed to delete goal." });
  }
});

// POST /goals/:id/deposit — add money to a goal
router.post("/goals/:id/deposit", authRequired, async (req, res) => {
  try {
    const amt = Number(req.body?.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: "Amount must be greater than zero." });
    }
    const goal = await SavingsGoal.findOne({ _id: req.params.id, userId: req.userId });
    if (!goal) return res.status(404).json({ message: "Goal not found." });

    goal.currentBalance = (goal.currentBalance || goal.savedAmount || 0) + amt;
    goal.savedAmount = goal.currentBalance;
    await goal.save();

    await SavingsTransaction.create({
      goalId: goal._id,
      userId: req.userId,
      type: "deposit",
      amount: amt,
      date: new Date(),
      goalNameSnapshot: goal.name,
    });

    // Deduct from spendable balance — matches existing savings contract
    await User.findByIdAndUpdate(req.userId, { $inc: { currentBalance: -amt } });
    res.json(serializeGoal(goal));
  } catch (err) {
    console.error("[savings/goals] deposit error:", err.message);
    res.status(500).json({ message: "Failed to add to savings." });
  }
});

// POST /goals/:id/withdraw — pull money out of a goal, back to spendable
router.post("/goals/:id/withdraw", authRequired, async (req, res) => {
  try {
    const amt = Number(req.body?.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: "Amount must be greater than zero." });
    }
    const goal = await SavingsGoal.findOne({ _id: req.params.id, userId: req.userId });
    if (!goal) return res.status(404).json({ message: "Goal not found." });

    const balance = goal.currentBalance || goal.savedAmount || 0;
    if (amt > balance) {
      return res.status(400).json({ message: "Cannot withdraw more than the current balance." });
    }

    goal.currentBalance = balance - amt;
    goal.savedAmount = goal.currentBalance;
    await goal.save();

    await SavingsTransaction.create({
      goalId: goal._id,
      userId: req.userId,
      type: "withdrawal",
      amount: amt,
      date: new Date(),
      goalNameSnapshot: goal.name,
    });

    await User.findByIdAndUpdate(req.userId, { $inc: { currentBalance: amt } });
    res.json(serializeGoal(goal));
  } catch (err) {
    console.error("[savings/goals] withdraw error:", err.message);
    res.status(500).json({ message: "Failed to withdraw." });
  }
});

// GET /transactions?startDate=&endDate= — calendar query
router.get("/transactions", authRequired, async (req, res) => {
  try {
    const { startDate, endDate } = req.query || {};
    const query = { userId: req.userId };
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    }
    const txns = await SavingsTransaction.find(query).sort({ date: -1 });
    res.json(txns);
  } catch (err) {
    console.error("[savings/transactions] list error:", err.message);
    res.status(500).json({ message: "Failed to load savings transactions." });
  }
});

module.exports = router;
