const express = require("express");
const bcrypt = require("bcrypt");

const { authRequired } = require("../middleware/auth");
const User = require("../models/User");

const router = express.Router();

// Get the authenticated user's profile
router.get("/me", authRequired, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.userId;
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: user.dateOfBirth,
      incomeSettings: user.incomeSettings || {},
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({ message: "Failed to load profile" });
  }
});

// Update profile details and income settings
router.put("/me", authRequired, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.userId;
    const { firstName, lastName, email, dateOfBirth, incomeSettings, passwordChange } =
      req.body || {};

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const updates = {};
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (firstName !== undefined || lastName !== undefined) {
      const newName = `${firstName ?? user.firstName ?? ""} ${lastName ?? user.lastName ?? ""}`.trim();
      if (newName) updates.name = newName;
    }
    if (email !== undefined) updates.email = email;
    if (dateOfBirth !== undefined) updates.dateOfBirth = dateOfBirth;

    if (incomeSettings) {
      const current = user.incomeSettings || {};
      updates.incomeSettings = {
        amount: incomeSettings.amount ?? current.amount,
        frequency: incomeSettings.frequency ?? current.frequency,
        lastPaycheckDate: incomeSettings.lastPaycheckDate ?? current.lastPaycheckDate,
      };
    }

    if (email && email.toLowerCase().trim() !== user.email) {
      const emailInUse = await User.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: user._id },
      });
      if (emailInUse) {
        return res.status(400).json({ message: "Email is already in use by another account." });
      }
      updates.email = email.toLowerCase().trim();
    }

    if (passwordChange) {
      const { currentPassword, newPassword, confirmNewPassword } = passwordChange;
      if (!currentPassword || !newPassword || !confirmNewPassword) {
        return res.status(400).json({ message: "All password fields are required." });
      }
      if (newPassword !== confirmNewPassword) {
        return res.status(400).json({ message: "New passwords do not match." });
      }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Current password is incorrect." });
      }
      updates.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    Object.assign(user, updates);
    await user.save();

    res.json({
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: user.dateOfBirth,
      incomeSettings: user.incomeSettings || {},
    });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

module.exports = router;
