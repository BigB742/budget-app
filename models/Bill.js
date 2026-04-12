const mongoose = require("mongoose");

const billSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    dueDayOfMonth: { type: Number, required: true },
    category: { type: String },
    isActive: { type: Boolean, default: true },
    // Per-bill paid flag. The canonical source of paid-state for recurring
    // bills is still the BillPayment collection (one record per due date);
    // this flag is mainly for one-shot bills like the auto-created PayPulse
    // Premium bill where we want the doc to self-describe its paid-ness.
    paid: { type: Boolean, default: false },
    startDate: { type: Date, default: null },
    lastPaymentDate: { type: Date, default: null },
    lastPaymentAmount: { type: Number, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Bill", billSchema);
