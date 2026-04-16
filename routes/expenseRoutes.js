const express = require("express");

const Expense = require("../models/Expense");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/", authRequired, async (req, res) => {
  try {
    const { from, to, category, search, page, limit: limitStr, excludeSavings } = req.query;
    const query = { $or: [{ user: req.userId }, { userId: req.userId }] };

    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }
    if (category) {
      query.category = category;
    } else if (excludeSavings === "true" || excludeSavings === "1") {
      // The Expenses page uses this flag so savings transfers don't pollute
      // the spending list. Explicit category queries (like the Savings page
      // filtering to category=Savings) still work because this only applies
      // when no category was passed.
      query.category = { $ne: "Savings" };
    }
    if (search) query.description = { $regex: search, $options: "i" };

    // If pagination requested
    if (page) {
      const lim = Math.min(Number(limitStr) || 25, 100);
      const pg = Math.max(Number(page) || 1, 1);
      const [expenses, total] = await Promise.all([
        Expense.find(query).sort({ date: -1 }).skip((pg - 1) * lim).limit(lim),
        Expense.countDocuments(query),
      ]);
      return res.json({ expenses, total, count: expenses.length, page: pg, pages: Math.ceil(total / lim) });
    }

    // Default: return all (backwards compat)
    const expenses = await Expense.find(query).sort({ date: -1 });
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

// Note: this is also the entry point iOS/Android quick-expense widgets will
// post to (two-field expense: description + amount). The real-time balance
// widget reads from GET /api/summary/paycheck-current.
router.post("/", authRequired, async (req, res) => {
  try {
    const { date, amount, category, note, description } = req.body;
    const expenseDate = date ? new Date(date) : new Date();
    if (Number.isNaN(expenseDate.getTime())) {
      return res.status(400).json({ message: "Invalid date." });
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      return res.status(400).json({ message: "Invalid amount." });
    }

    const expense = await Expense.create({
      user: req.userId,
      userId: req.userId,
      date: expenseDate,
      amount: numericAmount,
      category: category || "Other",
      description: description || note,
    });
    res.status(201).json(expense);
  } catch (error) {
    console.error("Error creating expense", error);
    res.status(500).json({ message: "Failed to create expense" });
  }
});

// Update an existing expense. Validation mirrors POST: date must parse,
// amount must be a finite non-negative number. The lookup is scoped to
// the authenticated user via $or on both the legacy `user` field and
// the newer `userId` field, so there is no way to edit another user's
// row — a mismatching id returns 404 (intentionally indistinguishable
// from "doesn't exist" so we don't leak ownership metadata).
router.put("/:id", authRequired, async (req, res) => {
  try {
    const { date, amount, category, description, note } = req.body;
    const updates = {};

    if (date !== undefined) {
      const d = new Date(date);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ message: "Invalid date." });
      }
      updates.date = d;
    }

    if (amount !== undefined) {
      const n = Number(amount);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ message: "Invalid amount." });
      }
      updates.amount = n;
    }

    if (category !== undefined) updates.category = category || "Other";
    if (description !== undefined) updates.description = description;
    else if (note !== undefined) updates.description = note;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No fields to update." });
    }

    const updated = await Expense.findOneAndUpdate(
      {
        _id: req.params.id,
        $or: [{ user: req.userId }, { userId: req.userId }],
      },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Expense not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating expense", error);
    res.status(500).json({ message: "Failed to update expense" });
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
