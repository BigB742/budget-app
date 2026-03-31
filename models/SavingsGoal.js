const mongoose = require("mongoose");

const savingsGoalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    targetAmount: { type: Number, required: true, min: 0 },
    savedAmount: { type: Number, default: 0, min: 0 },
    perPaycheckAmount: { type: Number, default: 0, min: 0 },
    category: { type: String, default: "Other" },
    autopilotEnabled: { type: Boolean, default: false },
    lastAutopilotDate: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SavingsGoal", savingsGoalSchema);
