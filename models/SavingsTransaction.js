const mongoose = require("mongoose");

// SavingsTransaction — append-only log of every deposit/withdrawal
// against a savings goal. Powers the Calendar's per-day savings display
// and provides the historical trail even if a goal is renamed or deleted.
const savingsTransactionSchema = new mongoose.Schema(
  {
    goalId: { type: mongoose.Schema.Types.ObjectId, ref: "SavingsGoal", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["deposit", "withdrawal"], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, required: true, default: Date.now, index: true },
    // Snapshot of the goal name at time of transaction — stays stable
    // even if the goal is later renamed or deleted.
    goalNameSnapshot: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SavingsTransaction", savingsTransactionSchema);
