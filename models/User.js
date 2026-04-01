const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    phone: { type: String, trim: true },
    dateOfBirth: { type: Date },
    passwordHash: { type: String, required: true },
    onboardingComplete: { type: Boolean, default: false },
    isPremium: { type: Boolean, default: false },
    premiumSince: { type: Date },
    locale: { type: String, default: "en" },
    notificationPrefs: {
      billReminders: { type: Boolean, default: true },
      paydayReminders: { type: Boolean, default: true },
      reminderDaysBefore: { type: Number, default: 3 },
      lowBalanceWarning: { type: Boolean, default: false },
      lowBalanceThreshold: { type: Number, default: 100 },
    },
    incomeSettings: {
      amount: { type: Number, default: 0 },
      frequency: { type: String, enum: ["weekly", "biweekly", "monthly"], default: "biweekly" },
      lastPaycheckDate: { type: Date },
    },
    emailVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    verificationTokenExpiry: { type: Date },
    loginHistory: [{
      timestamp: { type: Date, default: Date.now },
      ip: { type: String },
      userAgent: { type: String },
    }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
