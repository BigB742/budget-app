const mongoose = require("mongoose");

const payScheduleSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    // legacy support
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      unique: true,
      sparse: true,
    },
    nextPayDate: { type: Date, required: true },
    frequency: { type: String, enum: ["weekly", "biweekly", "monthly"], required: true },
    amountPerPaycheck: { type: Number, required: true },
    autoSavings: { type: Number, default: 0 },
    autoInvesting: { type: Number, default: 0 },
  },
  { timestamps: true }
);

payScheduleSchema.pre("validate", function alignUser(next) {
  if (!this.user && this.userId) {
    this.user = this.userId;
  }
  if (!this.userId && this.user) {
    this.userId = this.user;
  }
  next();
});

module.exports = mongoose.model("PaySchedule", payScheduleSchema);
