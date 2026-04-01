const express = require("express");

const PaymentOverride = require("../models/PaymentOverride");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

// GET — all overrides for user, optionally filtered by date range
router.get("/", authRequired, async (req, res) => {
  try {
    const query = { user: req.userId };
    if (req.query.from || req.query.to) {
      query.date = {};
      if (req.query.from) query.date.$gte = new Date(req.query.from);
      if (req.query.to) query.date.$lte = new Date(req.query.to);
    }
    const overrides = await PaymentOverride.find(query).sort({ date: 1 });
    res.json(overrides);
  } catch (error) {
    console.error("Error fetching overrides:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// POST — create or update an override for a bill+date
router.post("/", authRequired, async (req, res) => {
  try {
    const { billId, date, amount, note } = req.body;
    if (!billId || !date || amount == null) {
      return res.status(400).json({ error: "billId, date, and amount are required." });
    }

    const override = await PaymentOverride.findOneAndUpdate(
      { user: req.userId, bill: billId, date: new Date(date + "T12:00:00") },
      { amount: Number(amount), note: note || "" },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    // Ensure user field is set on upsert
    if (!override.user) {
      override.user = req.userId;
      await override.save();
    }
    res.json(override);
  } catch (error) {
    console.error("Error saving override:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE
router.delete("/:id", authRequired, async (req, res) => {
  try {
    const deleted = await PaymentOverride.findOneAndDelete({
      _id: req.params.id,
      user: req.userId,
    });
    if (!deleted) return res.status(404).json({ error: "Override not found" });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting override:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
