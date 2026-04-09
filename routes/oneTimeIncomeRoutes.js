const express = require("express");
const { authRequired } = require("../middleware/auth");
const OneTimeIncome = require("../models/OneTimeIncome");
const User = require("../models/User");

const router = express.Router();

// GET / — list all one-time incomes for the user, with optional date filtering
router.get("/", authRequired, async (req, res) => {
  try {
    const filter = { user: req.userId };

    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(req.query.from);
      if (req.query.to) filter.date.$lte = new Date(req.query.to);
    }

    const items = await OneTimeIncome.find(filter).sort({ date: -1 });
    res.json(items);
  } catch (error) {
    console.error("Error fetching one-time incomes:", error);
    res.status(500).json({ error: "Unable to fetch one-time incomes." });
  }
});

// POST / — create a one-time income
router.post("/", authRequired, async (req, res) => {
  try {
    const { name, amount, date, note } = req.body;

    if (!name || amount == null || !date) {
      return res.status(400).json({ error: "name, amount, and date are required." });
    }

    // Enforce 50 extra income entries per calendar year
    const currentYear = new Date().getFullYear();
    const user = await User.findById(req.userId).select("extraIncomeCount extraIncomeYearReset");
    if (user) {
      const resetNeeded = !user.extraIncomeYearReset || user.extraIncomeYearReset !== currentYear;
      const count = resetNeeded ? 0 : (user.extraIncomeCount || 0);
      if (count >= 50) {
        return res.status(403).json({ error: "You have reached the maximum of 50 extra income entries for this year. Your limit resets on January 1st." });
      }
      await User.findByIdAndUpdate(req.userId, {
        extraIncomeCount: count + 1,
        extraIncomeYearReset: currentYear,
      });
    }

    const item = await OneTimeIncome.create({
      user: req.userId,
      name,
      amount: Number(amount),
      date: new Date(date + "T12:00:00"),
      note: note || "",
    });

    res.status(201).json(item);
  } catch (error) {
    console.error("Error creating one-time income:", error);
    res.status(500).json({ error: "Unable to create one-time income." });
  }
});

// PUT /:id — update a one-time income
router.put("/:id", authRequired, async (req, res) => {
  try {
    const { name, amount, date, note } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (amount !== undefined) update.amount = Number(amount);
    if (date !== undefined) update.date = new Date(date + "T12:00:00");
    if (note !== undefined) update.note = note;

    const item = await OneTimeIncome.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      update,
      { new: true }
    );
    if (!item) return res.status(404).json({ error: "Not found." });
    res.json(item);
  } catch (error) {
    console.error("Error updating one-time income:", error);
    res.status(500).json({ error: "Unable to update." });
  }
});

// DELETE /:id — delete a one-time income (must belong to user)
router.delete("/:id", authRequired, async (req, res) => {
  try {
    const item = await OneTimeIncome.findOneAndDelete({
      _id: req.params.id,
      user: req.userId,
    });

    if (!item) {
      return res.status(404).json({ error: "One-time income not found." });
    }

    res.json({ message: "Deleted successfully." });
  } catch (error) {
    console.error("Error deleting one-time income:", error);
    res.status(500).json({ error: "Unable to delete one-time income." });
  }
});

module.exports = router;
