const express = require("express");

const Rule = require("../models/Rule");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

router.get("/", authRequired, async (req, res) => {
  try {
    const rules = await Rule.find({ user: req.userId, isActive: { $ne: false } }).sort({
      createdAt: -1,
    });
    res.json(rules);
  } catch (error) {
    console.error("Error fetching rules:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/", authRequired, async (req, res) => {
  try {
    const { type, label, amountPerPaycheck, platform } = req.body || {};
    if (!type || !label || amountPerPaycheck == null) {
      return res
        .status(400)
        .json({ error: "Type, label, and amountPerPaycheck are required." });
    }
    const rule = await Rule.create({
      user: req.userId,
      type,
      label,
      amountPerPaycheck,
      platform,
    });
    res.status(201).json(rule);
  } catch (error) {
    console.error("Error creating rule:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/:id", authRequired, async (req, res) => {
  try {
    const { label, amountPerPaycheck, platform, isActive } = req.body || {};
    const update = {};
    if (label !== undefined) update.label = label;
    if (amountPerPaycheck !== undefined) update.amountPerPaycheck = amountPerPaycheck;
    if (platform !== undefined) update.platform = platform;
    if (isActive !== undefined) update.isActive = isActive;
    const updated = await Rule.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      update,
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ error: "Rule not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating rule:", error);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/:id", authRequired, async (req, res) => {
  try {
    const deleted = await Rule.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { isActive: false },
      { new: true }
    );
    if (!deleted) {
      return res.status(404).json({ error: "Rule not found" });
    }
    res.json({ message: "Rule deactivated" });
  } catch (error) {
    console.error("Error deleting rule:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
