const express = require("express");

const Expense = require("../models/Expense");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

// Dev-only: clear all expenses for the authenticated user
router.delete("/dev-reset", authRequired, async (req, res) => {
  try {
    const result = await Expense.deleteMany({
      $or: [{ user: req.userId }, { userId: req.userId }],
    });
    return res.json({ cleared: result.deletedCount || 0 });
  } catch (err) {
    console.error("Error clearing expenses for dev-reset:", err);
    return res.status(500).json({ message: "Failed to reset expenses." });
  }
});

router.get("/", authRequired, async (req, res) => {
  try {
    const { from, to } = req.query;
    const query = { $or: [{ user: req.userId }, { userId: req.userId }] };

    if (from || to) {
      query.date = {};
      if (from) {
        query.date.$gte = new Date(from);
      }
      if (to) {
        query.date.$lte = new Date(to);
      }
    }

    const expenses = await Expense.find(query).sort({ date: 1 });
    res.json(expenses);
  } catch (error) {
    console.error("Error fetching expenses", error);
    res.status(500).json({ message: "Failed to load expenses" });
  }
});

router.get("/day", authRequired, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ message: "date query required" });
    }
    const [y, m, d] = date.split("-").map(Number);
    const from = new Date(y, m - 1, d);
    const to = new Date(y, m - 1, d + 1);

    const expenses = await Expense.find({
      $or: [{ user: req.userId }, { userId: req.userId }],
      date: { $gte: from, $lt: to },
    }).sort({ date: 1 });

    res.json(expenses);
  } catch (error) {
    console.error("Error fetching day expenses", error);
    res.status(500).json({ message: "Failed to load day expenses" });
  }
});

// TODO: This POST endpoint will be the entry point for future iOS/Android
// quick-expense widgets (Widget 2 — two fields: description + amount, submits
// without opening the app). When building the React Native or PWA version,
// the widget should POST directly to this route with a valid auth token.
// The same applies to a real-time balance widget (Widget 1) which would read
// from GET /api/summary/paycheck-current.
router.post("/", authRequired, async (req, res) => {
  try {
    const { date, amount, category, note, description } = req.body;
    const expenseDate = date ? new Date(date) : new Date();
    const canonicalDate = expenseDate.toISOString().slice(0, 10);

    const expense = await Expense.create({
      user: req.userId,
      userId: req.userId,
      date: expenseDate,
      dateString: canonicalDate,
      amount: Number(amount),
      category: category || "Other",
      description: description || note,
    });
    res.status(201).json(expense);
  } catch (error) {
    console.error("Error creating expense", error);
    res.status(500).json({ message: "Failed to create expense" });
  }
});

router.delete("/:id", authRequired, async (req, res) => {
  try {
    const deleted = await Expense.findOneAndDelete({
      _id: req.params.id,
      $or: [{ user: req.userId }, { userId: req.userId }],
    });
    if (!deleted) {
      return res.status(404).json({ message: "Expense not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting expense", error);
    res.status(500).json({ message: "Failed to delete expense" });
  }
});

// Dev-only: clear all expenses for the authenticated user
router.delete("/dev-reset", authRequired, async (req, res) => {
  try {
    const result = await Expense.deleteMany({
      $or: [{ user: req.userId }, { userId: req.userId }],
    });
    res.json({ success: true, cleared: result.deletedCount || 0 });
  } catch (error) {
    console.error("Error clearing expenses", error);
    res.status(500).json({ message: "Failed to clear expenses" });
  }
});

module.exports = router;
