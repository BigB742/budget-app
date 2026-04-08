const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { authRequired } = require("../middleware/auth");
const User = require("../models/User");
const Bill = require("../models/Bill");
const IncomeSource = require("../models/IncomeSource");

const router = express.Router();

// Middleware: require admin
const requireAdmin = async (req, res, next) => {
  const user = await User.findById(req.userId).select("isAdmin");
  if (!user || !user.isAdmin) return res.status(403).json({ error: "Admin access required." });
  next();
};

// GET /api/admin/users — list all users
router.get("/users", authRequired, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}).select("-passwordHash -loginHistory").lean();
    // Enrich with income and bill data
    const enriched = await Promise.all(users.map(async (u) => {
      const sources = await IncomeSource.find({ user: u._id, isActive: true }).lean();
      const bills = await Bill.find({ user: u._id, isActive: { $ne: false } }).lean();
      return { ...u, incomeSources: sources, bills, billCount: bills.length, incomeCount: sources.length };
    }));
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: "Failed to load users." });
  }
});

// POST /api/admin/reset-password — generate temp password
router.post("/reset-password", authRequired, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required." });
    const tempPassword = crypto.randomBytes(4).toString("hex"); // 8-char random
    const hash = await bcrypt.hash(tempPassword, 10);
    await User.findByIdAndUpdate(userId, { passwordHash: hash });
    res.json({ tempPassword, message: "Temporary password set. Expires conceptually in 1 hour — user should change immediately." });
  } catch (error) {
    res.status(500).json({ error: "Failed to reset password." });
  }
});

module.exports = router;
