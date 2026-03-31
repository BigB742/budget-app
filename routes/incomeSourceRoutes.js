const express = require("express");

const { authRequired } = require("../middleware/auth");
const IncomeSource = require("../models/IncomeSource");

const router = express.Router();

// GET all active income sources for user
router.get("/", authRequired, async (req, res) => {
  try {
    const sources = await IncomeSource.find({
      user: req.userId,
      isActive: true,
    }).sort({ isPrimary: -1, createdAt: 1 });
    res.json(sources);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// POST create income source
router.post("/", authRequired, async (req, res) => {
  try {
    const { name, amount, frequency, nextPayDate, isPrimary } = req.body;
    if (!name || !amount || !frequency || !nextPayDate) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // If this is marked primary, unmark others
    if (isPrimary) {
      await IncomeSource.updateMany({ user: req.userId }, { isPrimary: false });
    }

    // If this is the first source, make it primary automatically
    const count = await IncomeSource.countDocuments({ user: req.userId, isActive: true });

    const source = await IncomeSource.create({
      user: req.userId,
      name,
      amount,
      frequency,
      nextPayDate: new Date(nextPayDate),
      isPrimary: isPrimary || count === 0,
    });

    res.status(201).json(source);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT update income source
router.put("/:id", authRequired, async (req, res) => {
  try {
    const source = await IncomeSource.findOne({ _id: req.params.id, user: req.userId });
    if (!source) {
      return res.status(404).json({ message: "Income source not found" });
    }

    const { name, amount, frequency, nextPayDate, isPrimary } = req.body;
    if (name !== undefined) source.name = name;
    if (amount !== undefined) source.amount = amount;
    if (frequency !== undefined) source.frequency = frequency;
    if (nextPayDate !== undefined) source.nextPayDate = new Date(nextPayDate);

    if (isPrimary) {
      await IncomeSource.updateMany(
        { user: req.userId, _id: { $ne: source._id } },
        { isPrimary: false }
      );
      source.isPrimary = true;
    }

    await source.save();
    res.json(source);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE income source (soft delete)
router.delete("/:id", authRequired, async (req, res) => {
  try {
    const source = await IncomeSource.findOne({ _id: req.params.id, user: req.userId });
    if (!source) {
      return res.status(404).json({ message: "Income source not found" });
    }

    source.isActive = false;
    await source.save();

    // If we deleted the primary, promote the next one
    if (source.isPrimary) {
      source.isPrimary = false;
      await source.save();
      const next = await IncomeSource.findOne({ user: req.userId, isActive: true });
      if (next) {
        next.isPrimary = true;
        await next.save();
      }
    }

    res.json({ message: "Income source removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
