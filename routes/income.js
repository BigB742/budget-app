const express = require("express");

const PaySchedule = require("../models/PaySchedule");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

// GET current income / pay schedule
router.get("/", authRequired, async (req, res) => {
  try {
    const userId = req.user?._id || req.userId;
    const schedule = await PaySchedule.findOne({
      $or: [{ user: userId }, { userId }],
    });

    if (!schedule) {
      return res.json(null);
    }

    return res.json({
      nextPayDate: schedule.nextPayDate,
      frequency: schedule.frequency,
      amountPerPaycheck: schedule.amountPerPaycheck,
      autoSavings: schedule.autoSavings || 0,
      autoInvesting: schedule.autoInvesting || 0,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST create or update income / pay schedule
router.post("/", authRequired, async (req, res) => {
  try {
    const userId = req.user?._id || req.userId;
    const { nextPayDate, frequency, amountPerPaycheck, autoSavings, autoInvesting } = req.body;

    if (!nextPayDate || !frequency || !amountPerPaycheck) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const update = {
      user: userId,
      userId,
      nextPayDate: new Date(nextPayDate),
      frequency,
      amountPerPaycheck,
    };

    if (autoSavings !== undefined) update.autoSavings = autoSavings;
    if (autoInvesting !== undefined) update.autoInvesting = autoInvesting;

    const schedule = await PaySchedule.findOneAndUpdate({ $or: [{ user: userId }, { userId }] }, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });

    return res.json({
      nextPayDate: schedule.nextPayDate,
      frequency: schedule.frequency,
      amountPerPaycheck: schedule.amountPerPaycheck,
      autoSavings: schedule.autoSavings || 0,
      autoInvesting: schedule.autoInvesting || 0,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
