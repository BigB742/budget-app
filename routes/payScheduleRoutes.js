const express = require("express");

const PaySchedule = require("../models/PaySchedule");
const Income = require("../models/Income");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

router.get("/me", authRequired, async (req, res) => {
  try {
    const schedule = await PaySchedule.findOne({
      $or: [{ user: req.userId }, { userId: req.userId }],
    });
    res.json(schedule);
  } catch (error) {
    console.error("Error fetching pay schedule:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", authRequired, async (req, res) => {
  try {
    const { firstPayDate, frequency, amountPerPaycheck, nextPayDate, amount } = req.body;
    const effectivePayDate = nextPayDate || firstPayDate;
    const effectiveAmount = amount || amountPerPaycheck;

    const schedule = await PaySchedule.findOneAndUpdate(
      { $or: [{ user: req.userId }, { userId: req.userId }] },
      {
        user: req.userId,
        userId: req.userId,
        nextPayDate: effectivePayDate,
        frequency,
        amountPerPaycheck: effectiveAmount,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (effectivePayDate && effectiveAmount) {
      const payStartDate = new Date(effectivePayDate);

      // Remove future paychecks from this date onward to avoid duplicates.
      await Income.deleteMany({
        user: req.userId,
        type: "paycheck",
        date: { $gte: payStartDate },
      });

      const paychecks = [];
      let cursor = new Date(payStartDate);
      for (let i = 0; i < 26; i += 1) {
        paychecks.push({
          user: req.userId,
          date: new Date(cursor),
          amount: Number(effectiveAmount),
          type: "paycheck",
        });
        cursor = addDays(cursor, 14);
      }

      if (paychecks.length) {
        await Income.insertMany(paychecks);
      }
    }

    res.json(schedule);
  } catch (error) {
    console.error("Error upserting pay schedule:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
