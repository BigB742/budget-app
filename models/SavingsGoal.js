const mongoose = require("mongoose");

// SavingsGoal — user-defined savings bucket with optional target.
// targetAmount is now nullable (null = no target set yet).
// isOnboardingGoal marks the goal auto-created during onboarding so the
// UI can give it special treatment if needed (currently renders same).
const savingsGoalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 50 },
    // currentBalance is the canonical field. `savedAmount` is kept as a
    // mirrored legacy field for the existing contribute/withdraw routes
    // and the dashboard `totalSaved` aggregation. Both stay in sync.
    currentBalance: { type: Number, default: 0, min: 0 },
    savedAmount: { type: Number, default: 0, min: 0 },
    // null = no target set. Legacy docs have numeric targetAmount.
    targetAmount: { type: Number, default: null, min: 0 },
    isOnboardingGoal: { type: Boolean, default: false },
    // Legacy fields kept for backward-compat with existing routes/jobs.
    perPaycheckAmount: { type: Number, default: 0, min: 0 },
    category: { type: String, default: "Other" },
    autopilotEnabled: { type: Boolean, default: false },
    lastAutopilotDate: { type: Date },
  },
  { timestamps: true }
);

// Keep currentBalance and savedAmount in sync on save so both reads work.
savingsGoalSchema.pre("save", function (next) {
  if (this.isModified("savedAmount") && !this.isModified("currentBalance")) {
    this.currentBalance = this.savedAmount;
  } else if (this.isModified("currentBalance") && !this.isModified("savedAmount")) {
    this.savedAmount = this.currentBalance;
  }
  next();
});

module.exports = mongoose.model("SavingsGoal", savingsGoalSchema);
