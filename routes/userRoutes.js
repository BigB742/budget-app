const express = require("express");
const bcrypt = require("bcrypt");

const { authRequired } = require("../middleware/auth");
const User = require("../models/User");
const { sendEmail } = require("../utils/email");
const { buildDeleteAccountEmail } = require("../utils/emailTemplates");

const router = express.Router();

// Whitelist of safe fields to return to the client. Must never include
// passwordHash, verificationCode, resetCode, deleteCode, twoFactorOTP,
// or any other sensitive credential field.
const userResponse = (user) => ({
  _id: user._id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  phone: user.phone,
  dateOfBirth: user.dateOfBirth,
  onboardingComplete: !!user.onboardingComplete,
  isPremium: !!user.isPremium,
  subscriptionStatus: user.subscriptionStatus || "free",
  trialEndDate: user.trialEndDate || null,
  subscriptionEndDate: user.subscriptionEndDate || null,
  locale: user.locale || "en",
  notificationPrefs: user.notificationPrefs || {},
  incomeSettings: user.incomeSettings || {},
  loginHistory: (user.loginHistory || []).slice(0, 5),
  twoFactorEnabled: !!user.twoFactorEnabled,
  incomeType: user.incomeType || "fixed",
  isAdmin: !!user.isAdmin,
  currentBalance: user.currentBalance || 0,
  createdAt: user.createdAt,
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
    // EXPLICIT WHITELIST. Do NOT add isPremium, subscriptionStatus,
    // onboardingComplete, isAdmin, stripeCustomerId, stripeSubscriptionId,
    // trialEndDate, subscriptionEndDate, emailVerified, or any other
    // privilege/credential field here. Those are set by the webhook,
    // dedicated routes, or the auth flow only — exposing them on this
    // endpoint is a paywall / privilege-escalation bypass.
    const {
      firstName, lastName, email, dateOfBirth, phone,
      incomeSettings, passwordChange, notificationPrefs,
      locale, twoFactorEnabled, currentBalance, incomeType, totalSavings,
      tourCompleted,
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
    if (twoFactorEnabled !== undefined) user.twoFactorEnabled = !!twoFactorEnabled;
    if (tourCompleted !== undefined) user.tourCompleted = !!tourCompleted;
    if (currentBalance !== undefined) {
      const n = Number(currentBalance);
      if (Number.isFinite(n)) user.currentBalance = n;
    }
    if (incomeType !== undefined && (incomeType === "fixed" || incomeType === "variable")) {
      user.incomeType = incomeType;
    }
    if (totalSavings !== undefined) {
      const n = Number(totalSavings);
      if (Number.isFinite(n) && n >= 0) user.totalSavings = n;
    }

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
      if (typeof newPassword !== "string" || newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters." });
      }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return res.status(401).json({ message: "Current password incorrect." });
      user.passwordHash = await bcrypt.hash(newPassword, 12);
      // Bump tokenVersion so all existing JWTs for this user become
      // invalid — anyone who was holding a stolen token loses access.
      user.tokenVersion = (user.tokenVersion || 0) + 1;
    }

    await user.save();
    res.json(userResponse(user));
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

// POST /send-delete-code — send 6-digit deletion confirmation code
router.post("/send-delete-code", authRequired, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.userId;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.deleteCode = code;
    user.deleteCodeExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    await sendEmail(
      user.email,
      "Confirm PayPulse account deletion",
      buildDeleteAccountEmail({ firstName: user.firstName, code })
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Send delete code error:", error);
    res.status(500).json({ message: "Failed to send confirmation code." });
  }
});

// DELETE /me — permanently delete account (requires 6-digit code)
router.delete("/me", authRequired, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.userId;
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ message: "Confirmation code is required." });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    if (!user.deleteCode || user.deleteCode !== code) {
      return res.status(401).json({ message: "Incorrect code." });
    }
    if (!user.deleteCodeExpiry || new Date() > user.deleteCodeExpiry) {
      return res.status(401).json({ message: "Code has expired. Please request a new one." });
    }

    const IncomeSource = require("../models/IncomeSource");
    const Bill = require("../models/Bill");
    const Expense = require("../models/Expense");
    const SavingsGoal = require("../models/SavingsGoal");
    const PaySchedule = require("../models/PaySchedule");
    const BillPayment = require("../models/BillPayment");
    const OneTimeIncome = require("../models/OneTimeIncome");
    const Investment = require("../models/Investment");
    const Debt = require("../models/Debt");
    const PaymentOverride = require("../models/PaymentOverride");

    await Promise.all([
      IncomeSource.deleteMany({ user: userId }),
      Bill.deleteMany({ user: userId }),
      Expense.deleteMany({ $or: [{ user: userId }, { userId }] }),
      SavingsGoal.deleteMany({ userId }),
      PaySchedule.deleteMany({ user: userId }),
      BillPayment.deleteMany({ user: userId }),
      OneTimeIncome.deleteMany({ user: userId }),
      Investment.deleteMany({ userId }),
      Debt.deleteMany({ user: userId }),
      PaymentOverride.deleteMany({ user: userId }),
    ]);

    await User.findByIdAndDelete(userId);

    res.json({ success: true });
  } catch (error) {
    console.error("Delete account error:", error);
    res.status(500).json({ message: "Failed to delete account." });
  }
});

// POST /reset-account — delete all financial data but keep the user account
router.post("/reset-account", authRequired, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.userId;
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ message: "Password is required." });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: "Incorrect password." });

    const IncomeSource = require("../models/IncomeSource");
    const Bill = require("../models/Bill");
    const Expense = require("../models/Expense");
    const SavingsGoal = require("../models/SavingsGoal");
    const PaySchedule = require("../models/PaySchedule");
    const BillPayment = require("../models/BillPayment");
    const OneTimeIncome = require("../models/OneTimeIncome");
    const Investment = require("../models/Investment");
    const Debt = require("../models/Debt");
    const PaymentOverride = require("../models/PaymentOverride");

    await Promise.all([
      IncomeSource.deleteMany({ user: userId }),
      Bill.deleteMany({ user: userId }),
      Expense.deleteMany({ $or: [{ user: userId }, { userId }] }),
      SavingsGoal.deleteMany({ userId }),
      PaySchedule.deleteMany({ user: userId }),
      BillPayment.deleteMany({ user: userId }),
      OneTimeIncome.deleteMany({ user: userId }),
      Investment.deleteMany({ userId }),
      Debt.deleteMany({ user: userId }),
      PaymentOverride.deleteMany({ user: userId }),
    ]);

    // Reset financial fields but keep user account
    user.onboardingComplete = false;
    user.currentBalance = 0;
    user.totalSavings = 0;
    user.extraIncomeCount = 0;
    user.extraIncomeYearReset = undefined;
    await user.save();

    res.json({ success: true });
  } catch (error) {
    console.error("Reset account error:", error);
    res.status(500).json({ message: "Failed to reset account." });
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

// POST /support-ticket — submit a support ticket
router.post("/support-ticket", authRequired, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.userId;
    const { subject, message } = req.body || {};
    if (!subject || !message) return res.status(400).json({ message: "Subject and message are required." });
    const user = await User.findById(userId).select("email firstName");
    if (!user) return res.status(404).json({ message: "User not found." });
    const SupportTicket = require("../models/SupportTicket");
    await SupportTicket.create({ userId, email: user.email, subject, message });

    // Send confirmation email to the user
    try {
      const { buildSupportConfirmationEmail } = require("../utils/emailTemplates");
      await sendEmail(
        user.email,
        "We received your support request — PayPulse",
        buildSupportConfirmationEmail({ firstName: user.firstName, subject, message })
      );
    } catch (emailErr) {
      console.error("[Support] Confirmation email failed:", emailErr.message);
      // Non-critical — ticket was saved successfully
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Support ticket error:", error);
    res.status(500).json({ message: "Failed to submit support ticket." });
  }
});

module.exports = router;
