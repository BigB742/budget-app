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
    onboardingDate: { type: Date, default: null },
    isPremium: { type: Boolean, default: false },
    premiumSince: { type: Date },
    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    locale: { type: String, default: "en" },
    subscriptionStatus: {
      type: String,
      // "cancelled" (British spelling) kept as a legacy alias for
      // "canceled" — both spellings coexist in older docs. Both are
      // mapped through isEffectivelyPremium() client-side.
      enum: ["free", "trialing", "active", "premium", "premium_monthly", "premium_annual", "canceled", "cancelled", "expired", "past_due"],
      default: "free",
    },
    trialStartDate: { type: Date },
    trialEndDate: { type: Date },
    // When the subscription access actually ends (for canceled subs, this is
    // the Stripe current_period_end — user keeps premium access until then).
    subscriptionEndDate: { type: Date },
    // §5 additive fields — sourced from Stripe webhooks, authoritative
    // beats optimistic route writes. `subscriptionLastEventAt` is the
    // Stripe event.created timestamp; we skip any webhook write where
    // our last-seen timestamp is newer so out-of-order deliveries can't
    // clobber a newer state.
    subscriptionCancelAtPeriodEnd: { type: Boolean, default: false },
    subscriptionCancelAt: { type: Date, default: null },
    subscriptionCurrentPeriodEnd: { type: Date, default: null },
    subscriptionTrialEnd: { type: Date, default: null },
    subscriptionLastEventAt: { type: Date, default: null },
    lastPaymentFailedAt: { type: Date, default: null },
    // Audit timestamp set when Stripe confirms the subscription was fully
    // deleted (customer.subscription.deleted webhook). Useful for churn
    // analytics and distinguishes "user ended" from "payment failed".
    subscriptionCancelledAt: { type: Date },
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
    incomeType: { type: String, enum: ["fixed", "variable"], default: "fixed" },
    totalSavings: { type: Number, default: 0 },
    extraIncomeCount: { type: Number, default: 0 },
    extraIncomeYearReset: { type: Number },
    emailVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    verificationTokenExpiry: { type: Date },
    loginHistory: [{
      timestamp: { type: Date, default: Date.now },
      ip: { type: String },
      userAgent: { type: String },
    }],
    isAdmin: { type: Boolean, default: false },
    // Bumped on password change / suspicious-activity sign-out to invalidate
    // all existing JWTs for this user. The middleware embeds this in the
    // signed token and rejects requests where the embedded version is older
    // than the current value.
    tokenVersion: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    initialSavings: { type: Number, default: 0 },
    verificationCode: { type: String },
    verificationCodeExpiry: { type: Date },
    passwordResetToken: { type: String },
    passwordResetExpiry: { type: Date },
    resetCode: { type: String },
    resetCodeExpiry: { type: Date },
    tourCompleted: { type: Boolean, default: false },
    // §10 — timestamp stamped when the tour finishes. Lets the client
    // distinguish "never ran" from "completed" without relying on the
    // boolean alone, and lets Settings' "Take tour" clear it to
    // unambiguously re-arm the flow.
    tourCompletedAt: { type: Date, default: null },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorOTP: { type: String },
    twoFactorOTPExpiry: { type: Date },
    deleteCode: { type: String },
    deleteCodeExpiry: { type: Date },
    billReminderEnabled: { type: Boolean, default: true },
    lowBalanceAlertEnabled: { type: Boolean, default: true },
    lowBalanceThreshold: { type: Number, default: 150 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
