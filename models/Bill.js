const mongoose = require("mongoose");

const billSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    dueDayOfMonth: { type: Number, required: true },
    category: { type: String },
    isActive: { type: Boolean, default: true },
    startDate: { type: Date, default: null },
    lastPaymentDate: { type: Date, default: null },
    lastPaymentAmount: { type: Number, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Bill", billSchema);
