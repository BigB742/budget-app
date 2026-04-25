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
const VALID_FREQUENCIES = ["weekly", "biweekly", "twicemonthly", "monthly"];
router.post("/", authRequired, async (req, res) => {
  try {
    const { name, amount, frequency, nextPayDate } = req.body;

    if (typeof name !== "string" || !name.trim() || name.length > 100) {
      return res.status(400).json({ message: "Name is required (max 100 characters)." });
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 1_000_000) {
      return res.status(400).json({ message: "Amount must be a positive number." });
    }
    if (!VALID_FREQUENCIES.includes(frequency)) {
      return res.status(400).json({ message: "Frequency must be one of: " + VALID_FREQUENCIES.join(", ") });
    }
    const parsedDate = new Date(nextPayDate);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: "Invalid nextPayDate." });
    }

    // Re-onboarding semantics: if the user already has a primary income
    // source we OVERWRITE it in place rather than rejecting. The
    // onboarding flow on the client treats a 403 "already have" as
    // success and proceeds, but the old source's fields (especially
    // nextPayDate) survive — so the dashboard kept showing the
    // previous anchor's paydays. A user who re-onboards with a new
    // anchor of 2026-05-08 was getting phantom 2026-04-24 paychecks
    // because the old IncomeSource still pointed at 4/24. Upsert
    // the primary so the user's typed-in values always win.
    const existingPrimary = await IncomeSource.findOne({
      user: req.userId,
      isActive: true,
      isPrimary: true,
    });
    let source;
    if (existingPrimary) {
      existingPrimary.name = name.trim();
      existingPrimary.amount = numericAmount;
      existingPrimary.frequency = frequency;
      existingPrimary.nextPayDate = parsedDate;
      // Clear stale cron bookkeeping so future paydays aren't suppressed
      // because the previous source had already been credited "today".
      existingPrimary.lastAutoIncomeDate = undefined;
      await existingPrimary.save();
      source = existingPrimary;
    } else {
      source = await IncomeSource.create({
        user: req.userId,
        name: name.trim(),
        amount: numericAmount,
        frequency,
        nextPayDate: parsedDate,
        isPrimary: true,
      });
    }

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
