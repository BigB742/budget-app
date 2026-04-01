const express = require("express");
const bcrypt = require("bcrypt");

const { authRequired } = require("../middleware/auth");
const User = require("../models/User");

const router = express.Router();

const userResponse = (user) => ({
  _id: user._id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  phone: user.phone,
  dateOfBirth: user.dateOfBirth,
  onboardingComplete: !!user.onboardingComplete,
  isPremium: !!user.isPremium,
  locale: user.locale || "en",
  notificationPrefs: user.notificationPrefs || {},
  incomeSettings: user.incomeSettings || {},
  loginHistory: (user.loginHistory || []).slice(0, 5),
});

router.get("/me", authRequired, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.userId;
    const user = await User.findById(userId).select("-passwordHash");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(userResponse(user));
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({ message: "Failed to load profile" });
  }
});

router.put("/me", authRequired, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.userId;
    const {
      firstName, lastName, email, dateOfBirth, phone,
      incomeSettings, passwordChange, notificationPrefs,
      locale, onboardingComplete, isPremium,
    } = req.body || {};

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (firstName !== undefined || lastName !== undefined) {
      user.name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }
    if (phone !== undefined) user.phone = phone;
    if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth;
    if (locale !== undefined) user.locale = locale;
    if (onboardingComplete !== undefined) user.onboardingComplete = onboardingComplete;
    if (isPremium !== undefined) { user.isPremium = isPremium; if (isPremium && !user.premiumSince) user.premiumSince = new Date(); }

    if (notificationPrefs) {
      const p = user.notificationPrefs || {};
      if (notificationPrefs.billReminders !== undefined) p.billReminders = notificationPrefs.billReminders;
      if (notificationPrefs.paydayReminders !== undefined) p.paydayReminders = notificationPrefs.paydayReminders;
      if (notificationPrefs.reminderDaysBefore !== undefined) p.reminderDaysBefore = notificationPrefs.reminderDaysBefore;
      if (notificationPrefs.lowBalanceWarning !== undefined) p.lowBalanceWarning = notificationPrefs.lowBalanceWarning;
      if (notificationPrefs.lowBalanceThreshold !== undefined) p.lowBalanceThreshold = notificationPrefs.lowBalanceThreshold;
      user.notificationPrefs = p;
    }

    if (incomeSettings) {
      const c = user.incomeSettings || {};
      user.incomeSettings = {
        amount: incomeSettings.amount ?? c.amount,
        frequency: incomeSettings.frequency ?? c.frequency,
        lastPaycheckDate: incomeSettings.lastPaycheckDate ?? c.lastPaycheckDate,
      };
    }

    if (email && email.toLowerCase().trim() !== user.email) {
      const emailInUse = await User.findOne({ email: email.toLowerCase().trim(), _id: { $ne: user._id } });
      if (emailInUse) return res.status(400).json({ message: "Email already in use." });
      user.email = email.toLowerCase().trim();
    }

    if (passwordChange) {
      const { currentPassword, newPassword, confirmNewPassword } = passwordChange;
      if (!currentPassword || !newPassword || !confirmNewPassword) return res.status(400).json({ message: "All password fields required." });
      if (newPassword !== confirmNewPassword) return res.status(400).json({ message: "Passwords don't match." });
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return res.status(401).json({ message: "Current password incorrect." });
      user.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    await user.save();
    res.json(userResponse(user));
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

// POST /complete-onboarding — mark onboarding done
router.post("/complete-onboarding", authRequired, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.userId;
    const user = await User.findByIdAndUpdate(userId, { onboardingComplete: true }, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(userResponse(user));
  } catch (error) {
    console.error("Complete onboarding error:", error);
    res.status(500).json({ message: "Failed to complete onboarding" });
  }
});

module.exports = router;
