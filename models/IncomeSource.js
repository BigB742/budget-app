const mongoose = require("mongoose");

const incomeSourceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    frequency: {
      type: String,
      enum: ["weekly", "biweekly", "twicemonthly", "monthly"],
      required: true,
    },
    nextPayDate: {
      type: Date,
      required: true,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastAutoIncomeDate: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("IncomeSource", incomeSourceSchema);
